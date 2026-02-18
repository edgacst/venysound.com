# -*- coding: utf-8 -*-
from app import app, db, User, Music
from werkzeug.security import generate_password_hash
from datetime import datetime

print("🎵 SoundWave 데이터베이스 초기화 시작...")

with app.app_context():
    # 1. 모든 테이블 삭제 (초기화)
    db.drop_all()
    
    # 2. 새 테이블 생성
    db.create_all()
    
    # 3. 기본 관리자 계정 생성
    try:
        admin = User(
            username="admin",
            email="admin@soundwave.com",
            password_hash=generate_password_hash("admin123")
        )
        db.session.add(admin)
        db.session.commit()
        print("✅ 관리자 계정 생성 완료 (admin/admin123)")
    except Exception as e:
        print(f"⚠️ 관리자 계정 생성 실패: {e}")
    
    print("✅ 데이터베이스 초기화 완료!")
    
    # 생성된 테이블 확인
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"생성된 테이블: {tables}")
    except Exception as e:
        print(f"테이블 확인 실패: {e}")