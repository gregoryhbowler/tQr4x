# Deploying tQr4x to GitHub Pages

## How It Works

This project is deployed via **GitHub Pages from the `docs/` folder on the `main` branch**.

The Vite build outputs directly to `docs/` (configured in `vite.config.ts`), and GitHub Pages serves from that folder.

## Deployment Steps

1. **Make your changes** to the source code

2. **Build the project:**
   ```bash
   npm run build
   ```
   This compiles TypeScript and builds the production bundle into `docs/`

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

4. **Done!** GitHub Pages will automatically serve the updated `docs/` folder.

## Live URL

The app is available at: https://gregoryhbowler.github.io/tQr4x/

## GitHub Pages Configuration

If you need to reconfigure GitHub Pages:

1. Go to the repository on GitHub
2. Settings > Pages
3. Under "Build and deployment":
   - Source: **Deploy from a branch**
   - Branch: **main** / **docs**

## Troubleshooting

- **404 errors on assets**: Make sure the `base` in `vite.config.ts` matches your repo name (`/tQr4x/`)
- **AudioWorklet paths**: The worklet files in `public/` get copied to `docs/` during build
- **Changes not showing**: GitHub Pages can take a few minutes to update; try a hard refresh (Cmd+Shift+R)
