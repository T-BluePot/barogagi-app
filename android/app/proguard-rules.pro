# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-inappbrowser-nitro (Nitro Module) — release(R8)에서 네이티브 Hybrid
# 클래스가 stripping되면 'Couldn't find class HybridInappbrowserNitro'로 크래시.
-keep class com.inappbrowsernitro.** { *; }
