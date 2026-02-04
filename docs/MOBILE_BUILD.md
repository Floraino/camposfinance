# Campos Finance - Mobile App Build Guide

Este guia explica como compilar e publicar o aplicativo Campos Finance para iOS e Android.

## Pré-requisitos

### Gerais
- Node.js 18+ e npm
- Git

### iOS
- macOS (obrigatório)
- Xcode 15+
- Apple Developer Account
- CocoaPods (`sudo gem install cocoapods`)

### Android
- Android Studio
- JDK 17+
- Android SDK (API 33+)

## Setup Inicial

### 1. Clone e instale dependências

```bash
git clone <seu-repositorio>
cd camposfinance
npm install
```

### 2. Build do projeto web

```bash
npm run build
```

### 3. Adicione as plataformas nativas

```bash
npx cap add ios
npx cap add android
```

### 4. Sincronize o projeto

```bash
npx cap sync
```

## Configuração iOS

### 1. Abra o projeto no Xcode

```bash
npx cap open ios
```

### 2. Configure o Signing

1. Selecione o target "App" no navigator
2. Vá para "Signing & Capabilities"
3. Selecione seu Team
4. Configure o Bundle Identifier: `com.camposfinance.app`

### 3. Configure os URL Schemes (Deep Links)

No Info.plist, adicione:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.camposfinance.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>camposfinance</string>
    </array>
  </dict>
</array>
```

### 4. Configure as permissões

No Info.plist, adicione:

```xml
<key>NSCameraUsageDescription</key>
<string>Precisamos da câmera para escanear cupons fiscais</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Precisamos acessar suas fotos para importar cupons fiscais</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Precisamos salvar comprovantes na sua galeria</string>
```

### 5. Build para TestFlight

1. Em Xcode, selecione "Any iOS Device" como target
2. Product → Archive
3. Após o archive, clique em "Distribute App"
4. Selecione "App Store Connect"
5. Siga os passos para upload

## Configuração Android

### 1. Abra o projeto no Android Studio

```bash
npx cap open android
```

### 2. Configure os Deep Links

Em `android/app/src/main/AndroidManifest.xml`, adicione dentro do `<activity>`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="camposfinance" />
</intent-filter>
```

### 3. Configure as permissões

Em `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

### 4. Gere o Keystore para assinatura

```bash
keytool -genkey -v -keystore camposfinance.keystore -alias camposfinance -keyalg RSA -keysize 2048 -validity 10000
```

### 5. Configure o build.gradle

Em `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("camposfinance.keystore")
            storePassword "SUA_SENHA"
            keyAlias "camposfinance"
            keyPassword "SUA_SENHA"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 6. Build AAB para Play Store

```bash
cd android
./gradlew bundleRelease
```

O arquivo AAB estará em: `android/app/build/outputs/bundle/release/app-release.aab`

### 7. Build APK para testes

```bash
cd android
./gradlew assembleRelease
```

## Desenvolvimento com Hot Reload

Para desenvolvimento com hot reload:

1. Certifique-se que o `capacitor.config.json` tem o server URL configurado
2. Execute o app no emulador/device
3. As mudanças no código serão refletidas automaticamente

## Troubleshooting

### iOS - Pod install falha

```bash
cd ios/App
pod deintegrate
pod install
```

### Android - Gradle sync falha

```bash
cd android
./gradlew clean
```

### Deep links não funcionam

1. Verifique se o scheme está correto em ambas as plataformas
2. Para testar:
   - iOS: `xcrun simctl openurl booted "camposfinance://billing/success"`
   - Android: `adb shell am start -W -a android.intent.action.VIEW -d "camposfinance://billing/success"`

## Checklist de Publicação

### iOS
- [ ] Ícones do app (1024x1024 e todos os tamanhos)
- [ ] Splash screen configurada
- [ ] Screenshots para App Store (6.7", 6.5", 5.5")
- [ ] Descrição e keywords
- [ ] Privacy Policy URL
- [ ] App Review Information

### Android
- [ ] Ícones do app (512x512 e adaptivos)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots para Play Store
- [ ] Descrição curta e completa
- [ ] Privacy Policy URL
- [ ] Content rating questionnaire
