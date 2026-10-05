/**
 * X Store API Worker - Main Entry Point
 * Uses Cloudflare Workers' file-based routing with [[path]].js
 */

import apiHandler from "./api/products.js";

export default apiHandler;