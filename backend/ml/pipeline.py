import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.impute import SimpleImputer


def load_dataset(storage_path: str) -> pd.DataFrame:
    ext = storage_path.rsplit('.', 1)[-1].lower()
    if ext == 'csv':
        return pd.read_csv(storage_path)
    elif ext in ('xlsx', 'xls'):
        return pd.read_excel(storage_path)
    elif ext == 'json':
        return pd.read_json(storage_path)
    elif ext == 'parquet':
        return pd.read_parquet(storage_path)
    raise ValueError(f"Unsupported file type: .{ext}")


def build_feature_matrix(df: pd.DataFrame, profiles: list) -> tuple:
    """Return (feature_df, feature_names, used_profiles) filtering out identifiers."""
    feature_parts = []
    feature_names = []
    used_profiles = []

    for p in profiles:
        col = p['column_name']
        if p['identifier_risk'] == 'high':
            continue
        if p['missing_percentage'] > 80:
            continue
        if p['inferred_type'] in ('text_or_identifier',):
            continue

        col_type = p['inferred_type']
        series = df[col]

        if col_type == 'numeric':
            vals = pd.to_numeric(series, errors='coerce').values.reshape(-1, 1)
            filled = SimpleImputer(strategy='median').fit_transform(vals).ravel()
            feature_parts.append(pd.Series(filled, name=col))
            feature_names.append(col)
            used_profiles.append(p)

        elif col_type == 'boolean':
            vals = series.astype(float).fillna(0.5)
            feature_parts.append(vals.rename(col))
            feature_names.append(col)
            used_profiles.append(p)

        elif col_type == 'categorical':
            if p['cardinality'] <= 1:
                continue
            if p['cardinality'] <= 20:
                dummies = pd.get_dummies(series.astype(str), prefix=col, dummy_na=False)
                for c in dummies.columns:
                    feature_parts.append(dummies[c].astype(float))
                    feature_names.append(str(c))
            else:
                freq = series.map(series.value_counts(normalize=True)).fillna(0)
                feature_parts.append(freq.rename(col))
                feature_names.append(col)
            used_profiles.append(p)

        elif col_type == 'datetime':
            try:
                parsed = pd.to_datetime(series, infer_datetime_format=True, errors='coerce')
                ref = parsed.max()
                if pd.isna(ref):
                    continue
                recency = (ref - parsed).dt.days
                median_recency = recency.median()
                recency = recency.fillna(median_recency)
                feature_parts.append(recency.rename(f'{col}_recency_days'))
                feature_names.append(f'{col}_recency_days')
                used_profiles.append(p)
            except Exception:
                pass

    if not feature_parts:
        raise ValueError("No usable features after excluding identifiers. "
                         "Check that your dataset has numeric or categorical columns.")

    feature_df = pd.concat(feature_parts, axis=1).reset_index(drop=True)
    return feature_df, feature_names, used_profiles


def _suggest_n_clusters(X: np.ndarray, max_k: int = 8) -> int:
    best_k, best_score = 3, -1
    n = X.shape[0]
    for k in range(2, min(max_k + 1, n)):
        try:
            km = KMeans(n_clusters=k, random_state=42, n_init=5, max_iter=100)
            labels = km.fit_predict(X)
            if len(set(labels)) < 2:
                continue
            score = silhouette_score(X, labels, sample_size=min(1000, n))
            if score > best_score:
                best_score, best_k = score, k
        except Exception:
            pass
    return best_k


def _explain_cluster(df: pd.DataFrame, profiles: list, labels: np.ndarray, cluster_id: int) -> dict:
    mask = labels == cluster_id
    cluster_df = df[mask]
    total = len(df)
    cluster_size = int(mask.sum())

    dominant_signals = []
    latent_features = {}

    for p in profiles:
        if p['identifier_risk'] == 'high':
            continue
        col = p['column_name']
        if col not in df.columns:
            continue
        col_type = p['inferred_type']

        if col_type == 'numeric':
            g_mean = pd.to_numeric(df[col], errors='coerce').mean()
            c_mean = pd.to_numeric(cluster_df[col], errors='coerce').mean()
            if pd.isna(g_mean) or pd.isna(c_mean) or g_mean == 0:
                continue
            ratio = c_mean / g_mean
            label = p['semantic_guess'] or col
            if ratio > 1.3:
                dominant_signals.append(f"high {label}")
                latent_features[label] = 'high'
            elif ratio < 0.7:
                dominant_signals.append(f"low {label}")
                latent_features[label] = 'low'
            else:
                latent_features[label] = 'average'

        elif col_type == 'categorical':
            c_mode = cluster_df[col].mode()
            g_mode = df[col].mode()
            if len(c_mode) and len(g_mode):
                val = str(c_mode.iloc[0])
                if c_mode.iloc[0] != g_mode.iloc[0]:
                    dominant_signals.append(f"{col}: {val}")
                latent_features[col] = val

    return {
        'cluster_id': cluster_id,
        'cluster_size': cluster_size,
        'cluster_percentage': round(cluster_size / max(total, 1) * 100, 1),
        'dominant_signals': dominant_signals[:8],
        'latent_features': latent_features,
    }


def run_segmentation(df: pd.DataFrame, profiles: list, n_clusters: int | None = None) -> dict:
    """Full pipeline: feature engineering → scale → PCA → KMeans → cluster explanations."""
    feature_df, feature_names, used_profiles = build_feature_matrix(df, profiles)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(feature_df.values)

    n_components = min(20, len(feature_names), X_scaled.shape[0] - 1)
    pca = PCA(n_components=n_components, random_state=42)
    X_pca = pca.fit_transform(X_scaled)

    if n_clusters is None:
        n_clusters = _suggest_n_clusters(X_pca)
    n_clusters = max(2, min(int(n_clusters), 10))

    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10, max_iter=300)
    labels = km.fit_predict(X_pca)

    try:
        sil = float(silhouette_score(X_pca, labels, sample_size=min(2000, len(labels))))
        confidence = round((sil + 1) / 2, 2)
    except Exception:
        confidence = 0.5

    cluster_explanations = [
        {**_explain_cluster(df, used_profiles, labels, i), 'confidence_score': confidence}
        for i in range(n_clusters)
    ]

    return {
        'n_clusters': n_clusters,
        'feature_names': feature_names,
        'cluster_explanations': cluster_explanations,
        'silhouette_score': confidence,
        'pca_variance_explained': round(float(pca.explained_variance_ratio_.sum()) * 100, 1),
        'n_features_used': len(feature_names),
        'used_columns': [p['column_name'] for p in used_profiles],
    }
