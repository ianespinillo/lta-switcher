#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

// 1. DEFINICIÓN DE ESTRUCTURAS DE DATOS

// Esta estructura es SOLO para leer el CSV (Paths en texto)
#[derive(Debug, serde::Deserialize)]
struct CsvRecord {
    country: String,
    competition: String,
    country_flag: String,     // Ruta al archivo (ej: "assets/flags/arg.svg")
    competition_logo: String, // Ruta al archivo
    file: String,             // Ruta al archivo .big
}

#[derive(serde::Serialize)]
struct CompetitionDisplay {
    id: i32,
    name: String,
    logo_blob: Vec<u8>, // Enviamos el logo para mostrarlo
}

#[derive(serde::Serialize)]
struct CountryDisplay {
    id: i32,
    name: String,
    flag_blob: Vec<u8>, // Opcional si querés mostrar bandera
}

// Estas estructuras son para la APP y BD (Blobs en bytes)
#[derive(serde::Serialize, serde::Deserialize)]
struct Country {
    id: i32,
    name: String,
    flag_blob: Vec<u8>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Competition {
    id: i32,
    name: String,
    logo_blob: Vec<u8>,
    country_id: i32,
    file_blob: Vec<u8>,
}

// Estado compartido
struct AppState {
    db: Mutex<Connection>,
}

// 2. FUNCIÓN DE INICIALIZACIÓN DE LA DB
fn init_db() -> Connection {
    let path = "switcher_data.db";
    let conn = Connection::open(path).expect("Error al abrir/crear la base de datos");

    // Crear tabla COUNTRY
    conn.execute(
        "CREATE TABLE IF NOT EXISTS country (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE, 
            flag_blob BLOB
        )",
        [],
    )
    .expect("Error creando tabla country");

    // Crear tabla COMPETITION
    conn.execute(
        "CREATE TABLE IF NOT EXISTS competition (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            logo_blob BLOB,
            country_id INTEGER,
            file_blob BLOB,
            FOREIGN KEY(country_id) REFERENCES country(id)
        )",
        [],
    )
    .expect("Error creando tabla competition");

    conn
}

// 3. LÓGICA DE SEEDING (Aquí ocurre la magia)
fn seed_db_if_empty(conn: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    let csv_path = "assets/data.csv";

    // 1. Verificar si existe el CSV
    if !Path::new(csv_path).exists() {
        println!("⚠ No se encontró el archivo CSV en '{}'. Se omite el seed.", csv_path);
        return Ok(());
    }

    // 2. Contar filas del CSV
    let mut rdr = csv::Reader::from_path(csv_path)?;
    let csv_count = rdr.records().count() as i32;

    // 3. Contar filas en DB
    let db_count: i32 = conn.query_row(
        "SELECT count(*) FROM competition",
        [],
        |row| row.get(0),
    )?;

    // 4. Si DB >= CSV -> no seed
    if db_count >= csv_count {
        println!("⏭ La base de datos ya tiene datos ({} >= {}). Saltando seeding.", db_count, csv_count);
        return Ok(());
    }

    // 5. Si no, limpiar DB
    println!("🔄 DB desactualizada. Reseteando tablas...");

    conn.execute("DELETE FROM competition", [])?;
    conn.execute("DELETE FROM country", [])?;

    // Intentar resetear autoincrement sin romper nada si no existe sqlite_sequence
    let _ = conn.execute("DELETE FROM sqlite_sequence WHERE name = 'competition'", []);
    let _ = conn.execute("DELETE FROM sqlite_sequence WHERE name = 'country'", []);

    println!("🧨 Tablas limpiadas. Iniciando nuevo seeding...");

    // 6. Volver a abrir el CSV para leer los datos (el Reader anterior ya se consumió)
    let mut rdr = csv::Reader::from_path(csv_path)?;

    // 7. Transacción de inserciones
    let tx = conn.transaction()?;

    let mut country_cache: HashMap<String, i32> = HashMap::new();

    for result in rdr.deserialize() {
        let record: CsvRecord = result?;

        let country_name = record.country.trim().to_string();

        // Leer blobs desde rutas
        let flag_bytes = fs::read(&record.country_flag)
            .map_err(|e| format!("Error leyendo flag '{}': {}", record.country_flag, e))?;

        let logo_bytes = fs::read(&record.competition_logo)
            .map_err(|e| format!("Error leyendo logo '{}': {}", record.competition_logo, e))?;

        let file_bytes = fs::read(&record.file)
            .map_err(|e| format!("Error leyendo archivo .big '{}': {}", record.file, e))?;

        // Insertar país si no existe
        let country_id = if let Some(id) = country_cache.get(&country_name) {
            *id
        } else {
            tx.execute(
                "INSERT OR IGNORE INTO country (name, flag_blob) VALUES (?1, ?2)",
                params![country_name, flag_bytes],
            )?;

            let id: i32 = tx.query_row(
                "SELECT id FROM country WHERE name = ?1",
                params![country_name],
                |row| row.get(0),
            )?;

            country_cache.insert(country_name.clone(), id);
            id
        };

        // Insertar competición
        tx.execute(
            "INSERT INTO competition (name, logo_blob, country_id, file_blob)
             VALUES (?1, ?2, ?3, ?4)",
            params![record.competition.trim(), logo_bytes, country_id, file_bytes],
        )?;

        println!("   -> Importado: {} ({})", record.competition, country_name);
    }

    // 8. Finalizar transacción
    tx.commit()?;

    println!("🚀 Seeding completado con éxito.");

    Ok(())
}


// 4. COMANDOS TAURI
#[tauri::command]
fn get_countries(state: State<AppState>) -> Vec<CountryDisplay> {
    let conn = state.db.lock().unwrap();

    // 2. Modificamos el SELECT para traer la bandera
    let mut stmt = conn
        .prepare("SELECT id, name, flag_blob FROM country ORDER BY name ASC")
        .unwrap();

    let countries = stmt
        .query_map([], |row| {
            Ok(CountryDisplay {
                id: row.get(0)?,
                name: row.get(1)?,
                flag_blob: row.get(2)?, // <--- Mapeamos el blob
            })
        })
        .unwrap();

    countries.filter_map(|r| r.ok()).collect()
}
#[tauri::command]
fn get_competitions_by_country(country_id: i32, state: State<AppState>) -> Vec<CompetitionDisplay> {
    let conn = state.db.lock().unwrap();

    // Seleccionamos solo lo visual, NO el file_blob
    let mut stmt = conn
        .prepare("SELECT id, name, logo_blob FROM competition WHERE country_id = ?1 ORDER BY name ASC")
        .unwrap();

    let competitions = stmt
        .query_map(params![country_id], |row| {
            Ok(CompetitionDisplay {
                id: row.get(0)?,
                name: row.get(1)?,
                logo_blob: row.get(2)?,
            })
        })
        .unwrap();

    // Convertimos el iterador a Vector y manejamos errores silenciosamente (unwrap_or_default)
    competitions.filter_map(|r| r.ok()).collect()
}

#[tauri::command]
fn install_competition(competition_id: i32, state: State<AppState>) -> Result<(), String> {
    println!("🔍 [DEBUG] Solicitud recibida para ID: {}", competition_id);

    // 1. Conectar a DB
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // 2. Buscar BLOB
    let mut stmt = conn
        .prepare("SELECT file_blob FROM competition WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    // Usamos 'Option' para saber si encontró algo o no
    let file_blob_opt: Option<Vec<u8>> = stmt
        .query_row(params![competition_id], |row| row.get(0))
        .optional() // Necesitas: use rusqlite::OptionalExtension; arriba
        .map_err(|e| format!("Error SQL: {}", e))?;

    let file_blob = match file_blob_opt {
        Some(blob) => blob,
        None => {
            return Err(format!(
                "❌ No se encontró ninguna competición con ID {}",
                competition_id
            ))
        }
    };

    println!(
        "📦 [DEBUG] Blob encontrado. Tamaño: {} bytes",
        file_blob.len()
    );

    if file_blob.is_empty() {
        return Err(
            "❌ El archivo en la base de datos está vacío (0 bytes). Revisa el seed.".to_string(),
        );
    }

    // 3. Ruta
    let target_path_str =
        r"C:\FC 26 Live Editor\mods\root\Legacy\data\ui\game\overlays\Generic\overlay_9002.BIG";
    let target_path = Path::new(target_path_str);

    println!("📂 [DEBUG] Intentando escribir en: {:?}", target_path);

    // 4. Crear carpetas
    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            println!("mkdir [DEBUG] Creando carpetas: {:?}", parent);
            fs::create_dir_all(parent)
                .map_err(|e| format!("Error creando carpetas (¿Permisos?): {}", e))?;
        }
    }

    // 5. Escribir
    match fs::write(target_path, file_blob) {
        Ok(_) => {
            println!("✅ [ÉXITO] Archivo escrito correctamente.");
            Ok(())
        }
        Err(e) => {
            println!("❌ [ERROR] Falló la escritura: {}", e);
            Err(format!("Error de escritura en disco: {}", e))
        }
    }
}

fn main() {
    // 1. Inicializar DB
    let mut db_connection = init_db();

    // 2. Correr el Seeder (pasamos referencia mutable)
    // Usamos un match para manejar errores sin romper el programa entero si falta el CSV
    match seed_db_if_empty(&mut db_connection) {
        Ok(_) => {}
        Err(e) => println!("❌ Error durante el seeding: {}", e),
    }

    // 3. Arrancar Tauri
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(db_connection),
        })
        .invoke_handler(tauri::generate_handler![
            get_countries,
            get_competitions_by_country,
            install_competition
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
