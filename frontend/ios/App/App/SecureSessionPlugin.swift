import Capacitor
import Foundation
import Security

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]

    private let service = "fyi.flycn.fridgeboard.ios.secure-session"
    private let legacyService = "com.fridgeboard.app.secure-session"

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            return call.resolve(["value": NSNull()])
        }
        guard let data = read(key: key, service: service) ?? read(key: key, service: legacyService) else {
            return call.resolve(["value": NSNull()])
        }
        if read(key: key, service: service) == nil {
            _ = write(key: key, data: data)
        }
        call.resolve(["value": String(data: data, encoding: .utf8) as Any])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            return call.reject("key and value are required")
        }
        guard let data = value.data(using: .utf8), write(key: key, data: data) else {
            return call.reject("secure storage write failed")
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            return call.reject("key is required")
        }
        SecItemDelete(baseQuery(key: key, service: service) as CFDictionary)
        SecItemDelete(baseQuery(key: key, service: legacyService) as CFDictionary)
        call.resolve()
    }

    @objc func reset(_ call: CAPPluginCall) {
        let status = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ] as CFDictionary)
        let legacyStatus = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: legacyService
        ] as CFDictionary)
        guard (status == errSecSuccess || status == errSecItemNotFound)
            && (legacyStatus == errSecSuccess || legacyStatus == errSecItemNotFound) else {
            call.reject("secure storage reset failed", "SECURE_STORAGE_RESET_FAILED", NSError(domain: NSOSStatusErrorDomain, code: Int(status)))
            return
        }
        call.resolve()
    }

    private func baseQuery(key: String, service: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }

    private func read(key: String, service: String) -> Data? {
        var query = baseQuery(key: key, service: service)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private func write(key: String, data: Data) -> Bool {
        let query = baseQuery(key: key, service: service)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert.merge(attributes) { _, new in new }
            return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
        }
        return status == errSecSuccess
    }
}
