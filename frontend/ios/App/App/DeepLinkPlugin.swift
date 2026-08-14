import Capacitor
import Foundation

@objc(DeepLinkPlugin)
public class DeepLinkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeepLinkPlugin"
    public let jsName = "DeepLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInitialUrl", returnType: CAPPluginReturnPromise)
    ]

    private static var pendingUrl: String?
    private static weak var instance: DeepLinkPlugin?

    override public func load() {
        Self.instance = self
    }

    @objc func getInitialUrl(_ call: CAPPluginCall) {
        let url = Self.pendingUrl
        Self.pendingUrl = nil
        call.resolve(["url": url ?? NSNull()])
    }

    public static func receive(url: URL) {
        let value = url.absoluteString
        pendingUrl = value
        guard let instance else { return }
        instance.notifyListeners("urlOpen", data: ["url": value])
    }
}
