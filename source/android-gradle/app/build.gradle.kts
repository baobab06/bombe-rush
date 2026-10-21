/*
 * BOMBE RUSH — appli Android avec AdMob (pubs récompensées + interstitielles).
 *
 * Le jeu (HTML/JS) est le même que la version web : il est copié depuis le
 * dossier www compilé (propriété -PwwwDir, par défaut ../../dist/www).
 * Les ressources (icônes, thème) sont partagées avec android/res.
 *
 *   gradle :app:bundleRelease   → app/build/outputs/bundle/release/app-release.aab (non signé)
 *   gradle :app:assembleRelease → app/build/outputs/apk/release/app-release-unsigned.apk
 */
plugins {
    id("com.android.application")
}

val wwwDir: String = (findProperty("wwwDir") as String?) ?: "${rootDir}/../dist/www"
val admobAppId: String = findProperty("admobAppId") as String

android {
    namespace = "com.bomberush.game"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bomberush.game"
        minSdk = 24
        targetSdk = 36
        versionCode = 12
        versionName = "1.1.2"
        manifestPlaceholders["admobAppId"] = admobAppId
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // pas de signature ici : le .aab est signé avec la clé d'importation du propriétaire,
            // l'APK de test avec la clé de test (hors dépôt)
            signingConfig = null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            res.srcDirs("${rootDir}/../android/res")
            assets.srcDirs(layout.buildDirectory.dir("generated/gameAssets"))
        }
    }

    androidResources {
        noCompress += listOf("html")
    }

    buildFeatures {
        buildConfig = true
    }
}

// le jeu compilé → assets/www (sans l'APK proposé au téléchargement sur le site)
val copyGame by tasks.registering(Copy::class) {
    from(wwwDir) { exclude("*.apk") }
    into(layout.buildDirectory.dir("generated/gameAssets/www"))
}
tasks.named("preBuild") { dependsOn(copyGame) }

dependencies {
    implementation("com.google.android.gms:play-services-ads:24.4.0")
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")
}
