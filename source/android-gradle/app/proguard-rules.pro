# BOMBE RUSH — règles R8.
# Le jeu (JavaScript) appelle les ponts Java par leur nom (addJavascriptInterface) :
# ces classes et méthodes ne doivent être ni supprimées ni renommées.
-keepattributes JavascriptInterface,*Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.bomberush.game.** { *; }
# noms conservés : rapports de plantage lisibles sans fichier de désobscurcissement
-dontobfuscate
