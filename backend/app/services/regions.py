from sqlalchemy.orm import Session
from app.models import Region


def cleanup_orphaned(db: Session, region_ids: list[int]) -> None:
    """Delete any of the given regions that no longer have a linked section."""
    if not region_ids:
        return
    orphaned = (
        db.query(Region)
        .filter(Region.id.in_(region_ids))
        .filter(~Region.sections.any())
        .all()
    )
    for region in orphaned:
        db.delete(region)
    if orphaned:
        db.commit()
