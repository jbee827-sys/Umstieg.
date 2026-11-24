import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        registriereReiseKategorie()
        return true
    }

    // MARK: - Mitteilungen ueber Firebase (Konzept Mitteilungen 6.2)
    //
    // Firebase selbst startet das Plugin @capacitor-firebase/messaging, und
    // zwar nur, wenn GoogleService-Info.plist im Bundle liegt. Ohne sie (Bau
    // ohne Secret) laeuft die App mit lokalen Mitteilungen wie bisher.

    /// Kategorie `reise`: Der Server setzt sie an jede Mitteilung (`aps.category`).
    /// Sie verbindet die Mitteilung mit der aufgeklappten Ansicht (Content
    /// Extension) und traegt zwei Aktionen. Die Beschriftung von `weg` setzt die
    /// Ansicht je Mitteilung neu („Weg zu Gleis 5“ / „Andere Verbindung waehlen“).
    /// Niemand sonst ruft `setNotificationCategories` - die lokalen
    /// Mitteilungen nutzen keine Aktionen (`registerActionTypes` wird nie gerufen).
    private func registriereReiseKategorie() {
        let weg = UNNotificationAction(identifier: "weg", title: "Weg zum Gleis", options: [.foreground])
        let oeffnen = UNNotificationAction(identifier: "oeffnen", title: "Reise öffnen", options: [.foreground])
        let reise = UNNotificationCategory(identifier: "reise", actions: [weg, oeffnen], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([reise])
    }

    /// APNs-Token und Fehler an das Firebase-Plugin weiterreichen (Plugin-README, iOS-Setup).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
