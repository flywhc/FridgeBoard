import Capacitor
import Network
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import ImageIO

@objc(NativeCapabilitiesPlugin)
public class NativeCapabilitiesPlugin: CAPPlugin, CAPBridgedPlugin, UIGestureRecognizerDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    public let identifier = "NativeCapabilitiesPlugin"
    public let jsName = "NativeCapabilities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNetworkStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickImage", returnType: CAPPluginReturnPromise),
    ]

    private var networkMonitor: NWPathMonitor?
    private var edgeGesture: UIScreenEdgePanGestureRecognizer?
    private var pendingImageCall: CAPPluginCall?

    override public func load() {
        super.load()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { [weak self] in
                self?.notifyListeners("networkChange", data: ["connected": path.status == .satisfied])
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.fridgeboard.app.network"))
        networkMonitor = monitor

        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView else { return }
            let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(self.handleEdgeBack(_:)))
            gesture.edges = .left
            gesture.cancelsTouchesInView = false
            gesture.delegate = self
            webView.addGestureRecognizer(gesture)
            self.edgeGesture = gesture
        }
    }

    deinit {
        networkMonitor?.cancel()
    }

    @objc func share(_ call: CAPPluginCall) {
        let text = call.getString("text")
        let url = call.getString("url")
        guard text != nil || url != nil else {
            call.reject("text or url is required")
            return
        }
        let value = [text, url].compactMap { $0 }.joined(separator: "\n")
        DispatchQueue.main.async { [weak self] in
            guard let self, let controller = self.bridge?.viewController else {
                call.reject("share view controller unavailable")
                return
            }
            let sheet = UIActivityViewController(activityItems: [value], applicationActivities: nil)
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = controller.view
                popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
            }
            sheet.completionWithItemsHandler = { _, completed, _, error in
                if let error {
                    call.reject(error.localizedDescription)
                } else if completed {
                    call.resolve()
                } else {
                    call.reject("分享已取消", "SHARE_CANCELLED")
                }
            }
            controller.present(sheet, animated: true)
        }
    }

    @objc func pickImage(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? "photo"
        pendingImageCall?.reject("已取消图片选择", "IMAGE_PICK_CANCELLED")
        pendingImageCall = call
        DispatchQueue.main.async { [weak self] in
            guard let self, let controller = self.bridge?.viewController else {
                call.reject("图片选择器不可用", "IMAGE_PICK_UNAVAILABLE")
                return
            }
            if source == "photo" {
                var configuration = PHPickerConfiguration(photoLibrary: .shared())
                configuration.filter = .images
                configuration.selectionLimit = 1
                let picker = PHPickerViewController(configuration: configuration)
                picker.delegate = self
                controller.present(picker, animated: true)
            } else {
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image], asCopy: true)
                picker.delegate = self
                picker.allowsMultipleSelection = false
                controller.present(picker, animated: true)
            }
        }
    }

    private func resolveImage(_ data: Data, mediaType: String, name: String?) {
        guard let call = pendingImageCall else { return }
        pendingImageCall = nil
        guard data.count <= 10_000_000 else {
            call.reject("图片超过 10MB 限制", "IMAGE_TOO_LARGE")
            return
        }
        guard ["image/png", "image/jpeg", "image/webp"].contains(mediaType) else {
            call.reject("HEIC/HEIF 需要系统转换后再导入", "IMAGE_UNSUPPORTED_FORMAT")
            return
        }
        call.resolve(["data": "data:\(mediaType);base64,\(data.base64EncodedString())", "mediaType": mediaType, "name": name ?? "image"])
    }

    private func convertHEICToPNG(_ data: Data, mediaType: String) throws -> (Data, String) {
        guard mediaType == "image/heic" || mediaType == "image/heif" else { return (data, mediaType) }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, Int64(width) * Int64(height) <= 16_000_000 else {
            throw NSError(domain: "NativeCapabilities", code: 12, userInfo: [NSLocalizedDescriptionKey: "HEIC/HEIF 图片超过 16MP 限制或元数据无效"])
        }
        guard let image = UIImage(data: data), let png = image.pngData() else {
            throw NSError(domain: "NativeCapabilities", code: 11, userInfo: [NSLocalizedDescriptionKey: "HEIC/HEIF 无法转换为 PNG"])
        }
        return (png, "image/png")
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let result = results.first else {
            pendingImageCall?.reject("已取消图片选择", "IMAGE_PICK_CANCELLED")
            pendingImageCall = nil
            return
        }
            let typeIdentifier = result.itemProvider.registeredTypeIdentifiers.first ?? UTType.image.identifier
            result.itemProvider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] data, error in
                let mediaType = UTType(typeIdentifier)?.preferredMIMEType ?? ""
                if let data {
                    guard data.count <= 10_000_000 else {
                        DispatchQueue.main.async { self?.pendingImageCall?.reject("图片超过 10MB 限制", "IMAGE_TOO_LARGE"); self?.pendingImageCall = nil }
                        return
                    }
                    do {
                        let converted = try self?.convertHEICToPNG(data, mediaType: mediaType)
                        DispatchQueue.main.async {
                            if let converted { self?.resolveImage(converted.0, mediaType: converted.1, name: "photo") }
                        }
                    } catch { DispatchQueue.main.async { self?.pendingImageCall?.reject(error.localizedDescription, "IMAGE_READ_FAILED"); self?.pendingImageCall = nil } }
                } else { DispatchQueue.main.async { self?.pendingImageCall?.reject(error?.localizedDescription ?? "无法读取图片", "IMAGE_READ_FAILED"); self?.pendingImageCall = nil } }
            }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else {
            pendingImageCall?.reject("无法读取图片", "IMAGE_READ_FAILED")
            pendingImageCall = nil
            return
        }
        let type = UTType(filenameExtension: url.pathExtension.lowercased())
        let mediaType = type?.preferredMIMEType ?? ""
        guard let call = pendingImageCall else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        DispatchQueue.global(qos: .userInitiated).async {
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            do {
                let values = try url.resourceValues(forKeys: [.fileSizeKey])
                if let fileSize = values.fileSize, fileSize > 10_000_000 {
                    throw NSError(domain: "NativeCapabilities", code: 10, userInfo: [NSLocalizedDescriptionKey: "图片超过 10MB 限制"])
                }
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                let converted = try self.convertHEICToPNG(data, mediaType: mediaType)
                DispatchQueue.main.async { self.resolveImage(converted.0, mediaType: converted.1, name: url.lastPathComponent) }
            } catch {
                DispatchQueue.main.async {
                    call.reject("无法读取图片", "IMAGE_READ_FAILED", error)
                    self.pendingImageCall = nil
                }
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingImageCall?.reject("已取消图片选择", "IMAGE_PICK_CANCELLED")
        pendingImageCall = nil
    }

    @objc func openExternalUrl(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url"), let url = URL(string: rawUrl), url.scheme?.lowercased() == "https" else {
            call.reject("仅允许打开 HTTPS 地址")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("无法打开系统浏览器")
                }
            }
        }
    }

    @objc func getNetworkStatus(_ call: CAPPluginCall) {
        let status = networkMonitor?.currentPath.status == .satisfied
        call.resolve(["connected": status])
    }

    @objc func getAppInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary
        let versionName = info?["CFBundleShortVersionString"] as? String ?? ""
        let versionCode = Int(info?["CFBundleVersion"] as? String ?? "") ?? 0
        call.resolve(["platform": "ios", "versionName": versionName, "versionCode": versionCode])
    }

    @objc private func handleEdgeBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, hasListeners("backButton") else { return }
        notifyListeners("backButton", data: [:])
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        hasListeners("backButton")
    }
}
