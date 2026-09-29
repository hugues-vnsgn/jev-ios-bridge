import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_11
    }
}

android {
    namespace = "dev.jevbridge.diagnostic"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.jevbridge.diagnostic"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    // The Compose Multiplatform artifacts, as a CMP app's Android target uses them.
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("org.jetbrains.compose.foundation:foundation:1.11.1")
    implementation("org.jetbrains.compose.material3:material3:1.11.0-alpha07")
    testImplementation("junit:junit:4.13.2")
}
