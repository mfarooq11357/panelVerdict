#!/usr/bin/env node
import { serve } from "../src/mcp.js";
import { loadUserEnv } from "../src/envfile.js";

loadUserEnv();
serve();
