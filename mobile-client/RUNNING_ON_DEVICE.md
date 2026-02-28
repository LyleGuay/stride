# Running on a Physical Android Device

## Prerequisites

- USB cable (must be a data cable, not charge-only)
- **USB debugging enabled** on your device:
  1. Go to **Settings → About phone**
  2. Tap **Build number** 7 times to unlock Developer Options
  3. Go to **Settings → Developer Options** and enable **USB debugging**
- **Expo Go** installed on your device (from the Play Store)
- ADB set up (see below)
- **ngrok** installed and authenticated (for `android:usb:local-api` — see below)

## ADB Setup

### macOS
```bash
brew install android-platform-tools
```

### WSL (Windows Subsystem for Linux)

WSL2 can't access USB devices directly, so the trick is to install ADB on Windows and symlink the Windows binary into WSL — that way WSL's `adb` calls go through Windows, which has full USB access.

**1. Remove the apt-installed ADB if you have it**
```bash
sudo apt purge adb -y
```

**2. Install ADB on Windows**

Download [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) for Windows and extract it (e.g. to `C:\platform-tools`).

**3. Symlink the Windows binary into WSL**

Replace the path below with wherever you extracted platform-tools:
```bash
sudo ln -s /mnt/c/platform-tools/adb.exe /usr/bin/adb
```

**4. Verify**
```bash
adb --version   # should print an ADB version, not an error
```

## ngrok Setup (local API only)

When running against the local Go API, the app uses ngrok to tunnel `localhost:3000` over HTTPS. Direct `adb reverse` for port 3000 doesn't work reliably on WSL2 due to how WSL bridges the network.

**1. Install ngrok**

Download from [ngrok.com/download](https://ngrok.com/download) and add to your PATH (or extract next to the project).

**2. Authenticate ngrok**

Sign up at ngrok.com (free), then run:
```bash
ngrok config add-authtoken <your-token>
```

The token is stored globally — you only need to do this once.

**3. Verify**
```bash
ngrok --version   # should print a version
```

The `android:usb:local-api` script handles starting and stopping ngrok automatically — you don't run it manually.

## Quick Start

Once ADB is set up and your phone is connected via USB, these scripts handle everything in one command:

```bash
# Local API (http://localhost:3000 proxied via USB)
npm run android:usb:local-api

# Live API (https://stride.lyleguay.com/api)
npm run android:usb:live-api
```

## What These Commands Do

**`android:usb:local-api`** (`scripts/android-local.sh`) runs:
1. `adb reverse tcp:8081 tcp:8081` — tunnels Metro bundler port so the device can download the JS bundle
2. Starts an ngrok tunnel to `localhost:3000` in the background
3. Polls ngrok's local API (`localhost:4040`) until the public HTTPS URL is ready
4. `EXPO_PUBLIC_API_URL=<ngrok-url> expo start --android --localhost` — starts Expo pointed at the ngrok tunnel
5. Kills the ngrok process when Expo exits

ngrok is used instead of `adb reverse tcp:3000` because WSL2's network bridge causes the port forward to only bind on IPv6 (`[::1]`), which Android can't reach over the USB reverse proxy.

**`android:usb:live-api`** runs:
1. `adb reverse tcp:8081 tcp:8081` — tunnels Metro bundler port
2. `EXPO_PUBLIC_API_URL=https://stride.lyleguay.com/api expo start --android --localhost` — starts Expo pointed at the deployed API

The Metro reverse proxy (`tcp:8081`) resets each time you unplug the cable, so re-run the command after reconnecting.

## Manual Steps (if you prefer)

### 1. Start the Go API

```bash
cd go-api && go run .
```

### 2. Start ngrok

```bash
ngrok http 3000
```

Note the `Forwarding` HTTPS URL (e.g. `https://xxxx.ngrok-free.app`).

### 3. Verify ADB sees your device

```bash
adb devices
```

Should show your device as `device` (not `unauthorized`). If `unauthorized`, accept the **Allow USB debugging?** prompt on your phone — pull down the notification shade if it doesn't appear automatically.

### 4. Set up the Metro reverse proxy

```bash
adb reverse tcp:8081 tcp:8081
```

### 5. Start Expo

```bash
EXPO_PUBLIC_API_URL=https://xxxx.ngrok-free.app npx expo start --android --localhost
```

Expo will open the app on your device automatically via ADB. If it prompts, choose **Expo Go**.

## Troubleshooting

**Device not detected (`adb devices` shows nothing)**
- Try a different USB cable — many cables are charge-only
- Wake your phone screen and look for an **Allow USB debugging?** prompt
- Run `adb kill-server && adb start-server` to restart ADB
- WSL: double-check the symlink points to the correct path — run `where adb` in PowerShell to find it

**Device shows as `unauthorized`**
- Pull down the notification shade on your phone and accept the **Allow USB debugging?** dialog
- Check "Always allow from this computer" to avoid this on future connections

**App loads but API calls fail**
- Confirm the Metro proxy is active: `adb reverse --list` should show `tcp:8081`
- Confirm the Go API is running: `curl http://localhost:3000/api/health` (or any valid endpoint)
- Confirm ngrok is running: open `http://localhost:4040` in a browser — you should see the ngrok inspector with active tunnels
- The login screen shows the API URL it's using below the Sign In button — verify it's the ngrok URL, not `localhost`
- Re-run the command after reconnecting — the Metro proxy resets on disconnect
