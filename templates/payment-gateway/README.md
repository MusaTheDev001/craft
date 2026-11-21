# Stellar Payment Gateway Template

A payment processing gateway built on the Stellar blockchain.

## Features

- Accept Stellar payments
- Multi-currency support
- Payment tracking
- Invoice generation
- Customizable branding

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the placeholders:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_APP_NAME` | Display name for the gateway |
| `NEXT_PUBLIC_APP_DESCRIPTION` | Short description of the gateway |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed gateway |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Stellar network (`testnet` or `mainnet`) |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | Horizon endpoint for the selected network |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Network passphrase used for signing |
| `NEXT_PUBLIC_PAYMENT_ASSET_CODE` | Asset code accepted for payments |
| `NEXT_PUBLIC_PAYMENT_ASSET_ISSUER` | Issuer account of the payment asset |
| `NEXT_PUBLIC_MERCHANT_PUBLIC_KEY` | Public key of the merchant receiving payments |
