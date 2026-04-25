#!/usr/bin/env node

console.error("Coding Factory is starting.");
import { createProgram } from "./cli.js";

await createProgram().parseAsync(process.argv);
