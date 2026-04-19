#!/usr/bin/env node

console.log("--- Coding Factory is starting ---");
import { createProgram } from "./cli.js";

await createProgram().parseAsync(process.argv);
