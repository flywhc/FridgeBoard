import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FridgeBridgeViewController()
        window?.makeKeyAndVisible()

        connectionOptions.urlContexts.forEach { DeepLinkPlugin.receive(url: $0.url) }
        connectionOptions.userActivities.forEach { activity in
            if let url = activity.webpageURL { DeepLinkPlugin.receive(url: url) }
        }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach { DeepLinkPlugin.receive(url: $0.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL { DeepLinkPlugin.receive(url: url) }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

private final class FridgeBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureSessionPlugin())
        bridge?.registerPluginInstance(DeepLinkPlugin())
    }
}
