# Project Cleanup and Refactoring Plan

This document outlines the steps to clean up the project, remove unnecessary files, and refactor folder and file names for clarity and consistency.








This plan will result in a cleaner, more maintainable codebase, ready to be pushed to a GitHub repository.

## 7. `dashboard-api` Sub-Directory Cleanup

A detailed review of the `education-dashboard-api` (to be renamed `dashboard-api`) directory reveals several files that should be cleaned up.

### Files to be Removed:
-   `output_file.xlsx`: Data file, not part of the application.
-   `output_file_1.csv`: Data file, not part of the application.
-   `conversations.db`: A database file, should not be in the repository.
-   `crawl_populate.log`: Log file.
-   `dataset_summary.json`: Generated file.
-   `test_sonar_backup.py`: Empty test file.
-   `programs.py`, `test_simple.py`: Simple test files that can be removed.
-   `run_prototype.bat`, `run_prototype.sh`: Looks like old scripts to run a prototype.
-   `setup.sh`, `setup.bat`: Simple scripts to create a venv, can be documented in the README instead.
-   `EVENT_LOOP_FIX_README.md`, `test_event_loop_fix.py`, `event_loop_manager.py`, `test_event_loop_manager.py`: These files seem to be related to a specific problem that was fixed. The code can be integrated into the main application and these separate files can be removed.

### Security Hardening in `app.py`:
- **Problem**: The `DB_CONFIG` in `app.py` contains hardcoded default values, including a password. This is a security risk.
- **Action**: Remove all hardcoded default values from the `os.getenv()` calls within the `DB_CONFIG` dictionary in `app.py`. The application should rely solely on environment variables set in the `.env` file.

### Security Hardening in `migrate_to_sql_flask.py`:
- **Problem**: The `DB_CONFIG` in `migrate_to_sql_flask.py` also contains hardcoded default credentials.
- **Action**: Refactor the script to remove these hardcoded values. Like `app.py`, it must source all credentials from environment variables.

### Consolidate and Clean `.env` File:
- **Problem**: The current `.env` file contains many unused variables from previous experiments and legacy code.
- **Action**: Create a new, clean `.env.example` file that contains only the environment variables that are actively used by the application. This will serve as a clear and accurate template for setting up the project. The used variables are:
    - `DB_HOST`
    - `DB_NAME`
    - `DB_USER`
    - `DB_PASSWORD`
    - `DB_PORT`
    - `GOOGLE_API_KEY`
    - `MISTRAL_API_KEY`

### Helper and Utility Scripts Analysis:
- The `education-dashboard-api` directory contains many helper scripts for setup, deployment, and running the application. To simplify the project, most of these should be removed in favor of clear instructions in a `README.md` file.
- **Keep**:
    - `ingest_data.py`: **This is the correct, modern data ingestion script** that uses the `LightRAG` library and is compatible with the application's query logic. It should be moved from the `lightrag-chatbot` directory and become the primary ingestion script.
    - `reset_database.py`: This is a useful developer utility for clearing the conversations database.
- **Remove**:
    - `crawl_and_populate_kb.py`: This is a legacy data ingestion script that is redundant and incompatible with the current RAG implementation.
    - `modules/`: This directory is mostly legacy. The only file in use is `db.py` for conversation history. The plan is to move `db.py` to the parent directory (as `database_manager.py`) and delete the rest of the `modules` directory.
    - `lightrag-chatbot/` (nested inside `education-dashboard-api`): This directory, containing a `test.html`, is unused by the API and should be removed.
    - `deploy.py`, `run.ps1`, `run.sh`, `setup.bat`, `setup.sh`: These are all redundant helper scripts. The setup and run instructions should be documented in the `README.md`.

### `scripts` and `database` Directories:
- **`database/`**: This directory contains the `schema.sql` file, which is essential for defining the database structure. It should be kept.
- **`scripts/`**:
    - **Keep**: `migrate_to_sql_flask.py` (current migration script) and `clear_conversations.py` (useful utility).
    - **Remove**: `migrate-to-sql.js` is a legacy script from the previous Node.js implementation and should be deleted.

### Files to be Updated:
-   `lightrag-chatbot/demo.py`: Contains a hardcoded path to `education-dashboard-api/`.
-   `README.md`: Contains references to `education-dashboard-api/`.

### Summary of Actions for `dashboard-api`:
1.  **Delete** the files listed above.
2.  **Create** a `tests/` directory and organize the valuable test files within it.
3.  **Update** the files with hardcoded paths.
4.  **Integrate** the event loop fix logic into the main application and remove the separate files.
5.  **Update** the main `README.md` with setup instructions instead of having separate shell/batch scripts.

### Project Cleanup Plan

This document outlines the tasks for cleaning and refactoring the `education-dashboard` project to prepare it for a public GitHub repository.

#### 1. Top-Level Cleanup

-   [ ] Delete temporary/junk directories: `__MACOSX/`.
-   [ ] Delete unused documentation and data files (`.pdf`, `.html`, `.json`, etc.) that are not essential for the application to run. Keep `dataset_summary.json`.
-   [ ] Delete the top-level `lightrag-chatbot` directory after its dependencies are merged.
-   [ ] Delete the unused `venv` directory in the root of the `education-dashboard` (Next.js) folder.

#### 2. Frontend Cleanup (`education-dashboard/`)

-   [ ] Delete the obsolete Node.js backend located at `education-dashboard/api/`.
-   [ ] Delete the unused React component: `education-dashboard/app/components/education-dashboard.tsx`.

#### 3. Backend Cleanup (`education-dashboard/dashboard-api/`)

-   [ ] **Code Consolidation:**
    -   [ ] Remove the `sys.path` hack from `app.py`.
    -   [ ] Merge all necessary Python dependencies from `lightrag-chatbot/setup.py` into `education-dashboard-api/requirements.txt`.
-   [ ] **Legacy Code Removal:**
    -   [ ] Delete legacy scripts: `crawl_and_populate_kb.py` and `query_rag.py`.
    -   [ ] Move `modules/db.py` to a more suitable location (e.g., `./database.py`) and delete the now-empty `modules/` directory.
    -   [ ] Delete the legacy `vector_db/` directory.
    -   [ ] Clean up all unused, redundant, and legacy `import` statements in `app.py`.
-   [ ] **Configuration:**
    -   [ ] Delete the redundant `.env` file inside the `dashboard-api` directory. The project should rely only on the one in the Next.js root.
    -   [ ] Delete miscellaneous helper/deployment scripts (`deploy.py`, `run.ps1`, `setup.sh`). All setup instructions should be in a single `README.md`.

#### 4. Security Hardening

-   [ ] Remove hardcoded fallback database credentials from `app.py`. The application should fail gracefully if environment variables are not set.
-   [ ] Remove hardcoded database credentials from the `scripts/migrate_to_sql_flask.py` script.

#### 5. Documentation

-   [ ] Create/update the main `README.md` file with clear, concise instructions for setting up the environment, installing dependencies (for both frontend and backend), and running the application.
