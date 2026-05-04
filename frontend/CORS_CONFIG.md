# CORS Configuration for NAm Frontend

## Overview
The frontend makes calls to multiple external APIs. Some of these have CORS (Cross-Origin Resource Sharing) limitations when called directly from a browser.

## CORS Status by API

### ✅ CORS-Friendly (No Workarounds Needed)
- **CoinGecko** - Free tier allows CORS requests
- **Finnhub** - Supports CORS (with API key)

### ⚠️ CORS-Blocked (Using Proxy Workaround)
The following APIs are called through a CORS proxy to handle browser restrictions:
- **Solana RPC** - JSON-RPC requests may be blocked
- **Blockchain.info** - Bitcoin balance queries require CORS proxy
- **Jupiter API** - Solana DeFi portfolio endpoint
- **CoinStats API** - Wallet balance queries

### 🚫 Requires Backend Endpoint (Security Issue)
- **RapidAPI eBay** - API key cannot be exposed in frontend code
  - Currently disabled with placeholder functionality
  - To enable: Set up a backend endpoint to proxy requests
  - See `frontend/src/lib/api.js` in `phonesApi.refreshPrice()` and `refreshAllPrices()`

## CORS Proxy Configuration

The app uses `cors.istrav.dev` as the default CORS proxy. To use a different proxy:

```bash
# Set in your .env file
REACT_APP_CORS_PROXY=https://your-cors-proxy-url
```

### Building Your Own CORS Proxy
If you want to use a custom CORS proxy:
1. Deploy `cors-anywhere` or similar
2. Configure it with your domain
3. Update `REACT_APP_CORS_PROXY` environment variable

## Environment Variables

```bash
# Required for cryptocurrency pricing
# (No auth required, but CORS proxy helpful for reliability)

# Stock pricing (requires API key)
REACT_APP_FINNHUB_API_KEY=your_finnhub_key

# Solana DeFi positions (optional, no API key needed for public endpoints)
REACT_APP_JUPITER_API_KEY=your_jupiter_key

# Wallet balance queries (optional)
REACT_APP_COINSTATS_API_KEY=your_coinstats_key

# CORS Proxy (if using custom proxy, default: cors.istrav.dev)
REACT_APP_CORS_PROXY=https://your-proxy-url

# ⚠️ SECURITY: Do NOT expose API keys for RapidAPI services
# These must be called through a backend endpoint, not frontend
# REACT_APP_RAPIDAPI_KEY=xxx  # DO NOT SET IN FRONTEND
# REACT_APP_RAPIDAPI_EBAY_HOST=xxx  # DO NOT SET IN FRONTEND
```

## Error Handling

All API calls have built-in error handling:
- Graceful fallbacks to zero/empty values
- Console warnings for debugging
- Automatic retry through CORS proxy

## Testing CORS Issues

To test if an API call is being blocked:

```bash
# In browser console:
curl -i "https://blockchain.info/balance?active=ADDRESS"

# If you see "No 'Access-Control-Allow-Origin' header" → CORS blocked → proxy needed
```

## Recommended Production Setup

1. **Set up a backend endpoint** to proxy authenticated APIs
2. **Store API keys only on the backend** server
3. **Use your own CORS proxy** or backend routes
4. **Example backend endpoint:**
   ```
   POST /api/phone-price?model=iPhone%2014
   Returns: { price: 299.99 }
   ```

## References
- [CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [cors-anywhere](https://github.com/Rob--W/cors-anywhere)
- API-specific CORS documentation links to be added per API

