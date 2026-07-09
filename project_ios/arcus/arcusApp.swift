//
//  arcusApp.swift
//  arcus
//
//  Created by 신유수 on 5/17/26.
//

import SwiftUI
import GoogleSignIn

@main
struct arcusApp: App {
    var body: some Scene {
        WindowGroup {
            NativeGoogleAuthGate()
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
