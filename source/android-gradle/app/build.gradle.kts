/*
 * BOMBE RUSH — appli Android avec AdMob (pubs récompensées + interstitielles).
 *
 * Le jeu (HTML/JS) est le même que la version web : il est copié depuis le
 * dossier www compilé (propriété -PwwwDir, par défaut ../../dist/www).
 * Les ressources (icônes, thème) sont partagées avec android/res.
 *
 *   gradle :app:bundleRelease   → app/build/outputs/bundle/release/app-release.aab (non signé)
 *   gradle :app:assembleRelease → app/build/outputs/apk/release/app-release-unsigned.apk
 *   gradle :app:assembleDebug   → app/build/outputs/apk/debug/app-debug.apk (version de TEST, installable telle quelle)
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
        versionCode = 60
        versionName = "1.16.0"
        manifestPlaceholders["admobAppId"] = admobAppId
    }

    buildTypes {
        // VERSION DE TEST (« Bombe Rush TEST ») : autre identifiant, donc elle s'installe
        // À CÔTÉ de la version du Play Store sans la remplacer ni toucher à sa sauvegarde.
        // Signée automatiquement avec la clé de test d'Android (aucune clé dans le dépôt).
        // Pubs : toujours celles de test (l'appli ne vient pas du Play Store, voir AdsBridge).
        debug {
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
            // même optimisation R8 que la version Play : l'APK de test vérifie qu'elle ne casse rien
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        release {
            // R8 : appli plus légère et plus rapide (recommandation Google Play)
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
    // achats intégrés (bombers, pièces) — Google Play exige la version 8 depuis août 2026
    implementation("com.android.billingclient:billing:8.0.0")
    // demande de note officielle (« In-App Review »)
    implementation("com.google.android.play:review:2.0.2")
    // connexion Google officielle (Credential Manager + « Se connecter avec Google »)
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
