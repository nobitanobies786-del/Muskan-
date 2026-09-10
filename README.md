# MS Muskan Select — Real E-commerce Foundation

This is NOT the previous static demo. It is a full-stack Node/Express storefront foundation with:
- Real server-side product catalog
- Persistent JSON data for easy setup (replace with PostgreSQL/MySQL for high-volume production)
- Secure admin authentication with bcrypt + JWT
- Admin product add/delete
- Admin order list
- Real COD order creation
- Razorpay Standard Checkout integration point
- Server-side Razorpay signature verification
- Order status endpoint
- Mobile-first premium storefront
- User's original MS Muskan Select logo
- Checkout form
- Coupon MUSKAN10
- Shipping/order tracking structure
- Shipping policy / returns / privacy / terms pages
- Shiprocket integration point documented in `.env.example`

## What makes payment real
When you add your own Razorpay Live/Test keys to `.env`, the site creates a Razorpay order on the server, opens Razorpay Checkout in the browser, and verifies the returned signature on the server before marking the order paid.

Razorpay requires server-side order creation and signature verification. Never put `RAZORPAY_KEY_SECRET` in browser code.

## Run locally
1. Install Node.js 20+
2. Open this folder in a terminal.
3. Run:
   npm install
4. Copy `.env.example` to `.env`.
5. Set a strong `JWT_SECRET` and admin password.
6. For online payment, add Razorpay test keys.
7. Run:
   npm start
8. Open http://localhost:3000

## Production
Because this now has a backend, do NOT deploy the whole project as a static Netlify Drop site.
Use a Node-capable host such as Render/Railway/Fly.io or a VPS, with a managed database for production.

For serious production:
- Move product/order/user storage from JSON to PostgreSQL/MySQL.
- Use HTTPS.
- Store secrets only in environment variables.
- Add rate limiting, CSRF protections as appropriate, validation, audit logs and backups.
- Add Razorpay webhooks and reconcile payment/order status.
- Connect a shipping provider (e.g. Shiprocket) using your own account/API credentials.
- Configure email/WhatsApp/SMS notifications.
- Configure your actual legal/business policies.
- Add image upload storage (S3/Cloudinary/etc.) rather than arbitrary URLs.
- Test COD, online payment, refunds, cancellations, stock race conditions and failed delivery flows before launch.

## Shipping
Shiprocket's API requires your own API user credentials and token. The project leaves the shipping service boundary ready for integration; courier/account credentials must come from your own Shiprocket account.

## Admin
Admin URL: /pages/admin.html
Default credentials are controlled by `.env`:
ADMIN_EMAIL
ADMIN_PASSWORD

Change the default password before any internet-facing deployment.


## GitHub Pages image fix
The frontend now uses relative paths for CSS, JS, pages and assets, so GitHub Pages project URLs do not look for images at the domain root. Static copies of products and site settings are included under `public/data/`.

## Admin uploads
The Node/Express backend supports authenticated logo and hero/background uploads. The Admin page also has a GitHub Pages fallback that stores edits in the current browser only; permanent live uploads require the Node backend because GitHub Pages cannot execute server-side Node code or write repository files from a public browser.
