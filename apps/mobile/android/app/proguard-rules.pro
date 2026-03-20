# Add project specific ProGuard rules here.

# WatermelonDB
-keep class com.nozbe.watermelondb.** { *; }

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Reanimated
-keep class com.swmansion.reanimated.** { *; }

# Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }

# NetInfo
-keep class com.reactnativecommunity.netinfo.** { *; }

# Keep native methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.uimanager.annotations.ReactProp *;
}

# Hermes engine
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
