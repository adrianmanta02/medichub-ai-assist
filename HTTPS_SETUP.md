# Setup HTTPS pentru Development

## Opțiunea 1: Folosește localhost (RECOMANDAT - Cel mai simplu)

**Localhost funcționează fără HTTPS!** Browser-ul permite geolocation pe `localhost` și `127.0.0.1`.

### Pași:
1. Asigură-te că rulezi aplicația pe `http://localhost:5173`
2. Verifică în browser că URL-ul este exact `http://localhost:5173` (nu `127.0.0.1` sau alt IP)
3. Permite accesul la locație când browser-ul cere

## Opțiunea 2: Configurează HTTPS cu mkcert (Pentru testare HTTPS reală)

### Instalare mkcert (Windows):

1. **Instalează Chocolatey** (dacă nu îl ai):
   ```powershell
   # Rulează PowerShell ca Administrator
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Instalează mkcert**:
   ```powershell
   choco install mkcert
   ```

3. **Instalează certificatul local**:
   ```powershell
   mkcert -install
   ```

4. **Generează certificatul pentru localhost**:
   ```powershell
   mkcert localhost 127.0.0.1 ::1
   ```
   
   Aceasta va crea:
   - `localhost.pem` (certificat)
   - `localhost-key.pem` (cheie privată)

5. **Restart serverul Vite**:
   ```bash
   npm run dev
   ```

6. **Accesează aplicația**:
   - `https://localhost:5173`
   - Browser-ul va arăta un avertisment de securitate (normal pentru certificat local)
   - Click "Advanced" → "Proceed to localhost"

## Opțiunea 3: Folosește vite-plugin-mkcert (Automat)

1. **Instalează plugin-ul**:
   ```bash
   npm install -D vite-plugin-mkcert
   ```

2. **Actualizează vite.config.ts**:
   ```typescript
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react-swc";
   import mkcert from 'vite-plugin-mkcert';
   
   export default defineConfig({
     server: {
       https: true
     },
     plugins: [react(), mkcert()],
   });
   ```

3. **Restart serverul**:
   ```bash
   npm run dev
   ```

## Verificare

După setup, verifică în consola browserului:
```javascript
console.log('Protocol:', window.location.protocol);
console.log('Hostname:', window.location.hostname);
```

Ar trebui să vezi:
- `Protocol: https:` (dacă folosești HTTPS)
- `Hostname: localhost` (pentru localhost)

## Rezolvare Probleme Locație

### Dacă locația apare ca "dezactivată":

1. **Verifică permisiunea în browser**:
   - Click pe iconița de locație în bara de adresă
   - Selectează "Permite" sau "Always allow"

2. **Verifică în consola browserului**:
   ```javascript
   navigator.permissions.query({name: 'geolocation'}).then(result => {
     console.log('Permission:', result.state);
   });
   ```

3. **Testează geolocation direct**:
   ```javascript
   navigator.geolocation.getCurrentPosition(
     (pos) => console.log('✅ Works!', pos.coords),
     (err) => console.error('❌ Error:', err.code, err.message)
   );
   ```

4. **Verifică setările browserului**:
   - Chrome: Settings → Privacy → Site settings → Location
   - Firefox: about:preferences#privacy → Permissions → Location
   - Edge: Settings → Privacy → Location

## Note Importante

- **Localhost funcționează fără HTTPS** - nu este necesar HTTPS pentru localhost
- Dacă folosești un IP (ex: `192.168.1.100:5173`), ai nevoie de HTTPS
- Certificatul generat cu mkcert este doar pentru development, nu pentru production

