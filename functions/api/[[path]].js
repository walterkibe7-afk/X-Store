/**
 * Elle Store API Worker - Main Entry Point
 * Uses Cloudflare Workers' file-based routing with [[path]].js
 */

import apiHandler from "./products.js";

export default apiHandler;