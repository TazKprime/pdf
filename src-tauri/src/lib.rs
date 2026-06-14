use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
pub struct PdfInfo {
    pub page_count: u32,
    pub file_size: u64,
    pub file_name: String,
}

#[tauri::command]
fn read_file_as_base64(file_path: String) -> Result<String, String> {
    let data = fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
fn write_file_from_base64(base64_data: String, output_path: String) -> Result<String, String> {
    let data = BASE64.decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    fs::write(&output_path, data)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(output_path)
}

#[tauri::command]
fn get_file_info(file_path: String) -> Result<PdfInfo, String> {
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let file_name = file_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("unknown.pdf")
        .to_string();

    Ok(PdfInfo {
        page_count: 0,
        file_size: metadata.len(),
        file_name,
    })
}

#[tauri::command]
fn file_exists(file_path: String) -> bool {
    fs::metadata(&file_path).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_file_as_base64,
            write_file_from_base64,
            get_file_info,
            file_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
