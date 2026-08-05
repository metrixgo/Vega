# Vega Safety Manager

A mobile-friendly Next.js demo for group safety check-ins.

Demo: https://vega-theta-virid.vercel.app/

## Run locally

Use `npm.cmd install`, then `npm.cmd run dev` on Windows. Open the displayed local URL in a browser.

## Deploy to Vercel

Push this folder to a Git repository, import it at [vercel.com/new](https://vercel.com/new), and deploy. Vercel detects Next.js automatically; no custom build settings are required.

## Demo data

The app stores demo event data in the browser. Separate browser tabs on the same device share updates. A production multi-device system needs an authenticated backend and real-time database; it should not rely on browser storage.
Safety manager for activities
