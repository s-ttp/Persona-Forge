import re
import pandas as pd

IDENTIFIER_KEYWORDS = {
    'id', 'uuid', 'email', 'phone', 'mobile', 'name', 'address', 'street',
    'account', 'customer', 'user', 'member', 'passport', 'ssn', 'nric',
    'ip', 'mac', 'url', 'token', 'key', 'hash', 'code', 'contact',
}

SEMANTIC_HINTS = {
    'age': 'age',
    'tenure': 'tenure',
    'spend': 'spend_amount',
    'revenue': 'revenue',
    'usage': 'usage_intensity',
    'session': 'session_count',
    'churn': 'churn_indicator',
    'score': 'score',
    'rating': 'rating',
    'complaint': 'complaint_count',
    'ticket': 'support_ticket_count',
    'plan': 'product_plan',
    'segment': 'segment',
    'region': 'region',
    'country': 'geography',
    'city': 'geography',
    'gender': 'demographic',
    'income': 'income_level',
    'salary': 'income_level',
    'purchase': 'purchase_behavior',
    'order': 'order_count',
    'product': 'product_category',
    'category': 'category',
    'channel': 'channel',
    'source': 'acquisition_source',
    'status': 'status',
    'active': 'activity_indicator',
    'date': 'datetime',
    'created': 'datetime',
    'updated': 'datetime',
    'month': 'datetime',
    'year': 'datetime',
    'frequency': 'frequency',
    'recency': 'recency',
    'monetary': 'monetary_value',
    'ltv': 'lifetime_value',
    'arpu': 'revenue_per_user',
    'nps': 'net_promoter_score',
    'csat': 'satisfaction_score',
}


def _infer_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return 'boolean'
    if pd.api.types.is_datetime64_any_dtype(series):
        return 'datetime'
    if pd.api.types.is_numeric_dtype(series):
        return 'numeric'
    sample = series.dropna().head(50)
    if len(sample) > 0:
        try:
            pd.to_datetime(sample, infer_datetime_format=True)
            return 'datetime'
        except Exception:
            pass
    unique_ratio = series.nunique() / max(len(series), 1)
    if unique_ratio > 0.85 and series.dtype == object:
        return 'text_or_identifier'
    return 'categorical'


def _identifier_risk(col_name: str, series: pd.Series, n: int) -> str:
    words = set(re.split(r'[_\-\s]+', col_name.lower()))
    if words & IDENTIFIER_KEYWORDS:
        return 'high'
    if series.dtype == object and series.nunique() / max(n, 1) > 0.9:
        return 'high'
    return 'low'


def _semantic_guess(col_name: str, col_type: str) -> str:
    name_lower = col_name.lower()
    for kw, semantic in SEMANTIC_HINTS.items():
        if kw in name_lower:
            return semantic
    return col_type


def profile_column(col_name: str, series: pd.Series, n: int) -> dict:
    missing_pct = round(series.isna().sum() / max(n, 1) * 100, 1)
    cardinality = int(series.nunique())
    col_type = _infer_type(series)
    id_risk = _identifier_risk(col_name, series, n)
    semantic = _semantic_guess(col_name, col_type)

    sample_vals = []
    try:
        sample = series.dropna().sample(min(5, max(cardinality, 1))).tolist()
        sample_vals = [str(v) for v in sample]
    except Exception:
        pass

    return {
        'column_name': col_name,
        'inferred_type': col_type,
        'cardinality': cardinality,
        'missing_percentage': missing_pct,
        'identifier_risk': id_risk,
        'semantic_guess': semantic,
        'sample_values': sample_vals,
    }


def profile_dataframe(df: pd.DataFrame) -> list:
    n = len(df)
    return [profile_column(col, df[col], n) for col in df.columns]
