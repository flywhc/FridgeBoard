import Capacitor
import Network
import UIKit

@objc(NativeCapabilitiesPlugin)
public class NativeCapabilitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCapabilitiesPlugin"
    public let jsName = "NativeCapabilities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNetworkStatus", returnType: CAPPluginReturnPromise),
    ]

    private var networkMonitor: NWPathMonitor?
    private var edgeGesture: UIScreenEdgePanGestureRecognizer?

    override public func load() {
        super.load()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.notifyListeners("networkChange", data: ["connected": path.status == .satisfied])
        }
        monitor.start(queue: DispatchQueue(label: "com.fridgeboard.app.network"))
        networkMonitor = monitor

        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView else { return }
            let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(self.handleEdgeBack(_:)))
            gesture.edges = .left
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
            controller.present(sheet, animated: true)
            call.resolve()
        }
    }

    @objc func getNetworkStatus(_ call: CAPPluginCall) {
        let status = networkMonitor?.currentPath.status == .satisfied
        call.resolve(["connected": status])
    }

    @objc private func handleEdgeBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, hasListeners("backButton") else { return }
        notifyListeners("backButton", data: [:])
    }
}
