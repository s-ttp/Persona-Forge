import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from models import SessionLocal, Project, DatasetUpload
from auth import get_current_user

router = APIRouter(prefix="/datasets", tags=["datasets"])

STORAGE_DIR = Path(__file__).parent.parent / "storage" / "datasets"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.json', '.parquet'}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/upload")
async def upload_dataset(
    project_id: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: CSV, XLSX, JSON, Parquet")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 50 MB limit")

    dataset_id = str(uuid.uuid4())
    storage_path = STORAGE_DIR / f"{dataset_id}{ext}"
    storage_path.write_bytes(content)

    try:
        import pandas as pd
        from ml.profiler import profile_dataframe

        readers = {
            '.csv': pd.read_csv,
            '.xlsx': pd.read_excel,
            '.xls': pd.read_excel,
            '.json': pd.read_json,
            '.parquet': pd.read_parquet,
        }
        df = readers[ext](storage_path)
        row_count = len(df)
        column_count = len(df.columns)
        profiles = profile_dataframe(df)
    except Exception as e:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Failed to parse dataset: {e}")

    record = DatasetUpload(
        id=dataset_id,
        project_id=project_id,
        user_id=user['id'],
        original_filename=file.filename,
        storage_path=str(storage_path),
        row_count=row_count,
        column_count=column_count,
        column_profiles=profiles,
        status='profiled',
    )
    db.add(record)
    db.commit()

    excluded_ids = [p['column_name'] for p in profiles if p['identifier_risk'] == 'high']
    high_missing = [p['column_name'] for p in profiles if p['missing_percentage'] > 50]
    usable = [p for p in profiles
              if p['identifier_risk'] == 'low'
              and p['missing_percentage'] <= 80
              and p['inferred_type'] not in ('text_or_identifier',)]

    return {
        'dataset_id': dataset_id,
        'filename': file.filename,
        'row_count': row_count,
        'column_count': column_count,
        'profiles': profiles,
        'warnings': {
            'identifier_columns_excluded': excluded_ids,
            'high_missing_columns': high_missing,
            'usable_column_count': len(usable),
        },
    }


@router.get("/{dataset_id}/profile")
def get_profile(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    record = db.query(DatasetUpload).filter(DatasetUpload.id == dataset_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {
        'dataset_id': dataset_id,
        'filename': record.original_filename,
        'row_count': record.row_count,
        'column_count': record.column_count,
        'profiles': record.column_profiles,
        'status': record.status,
    }
