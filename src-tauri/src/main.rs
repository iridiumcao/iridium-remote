// Prevents console window on Windows in release builds, but allows it in debug mode
// This lets developers see console output during development
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    iridium_remote_lib::run();
}
