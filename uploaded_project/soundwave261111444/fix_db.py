import sqlite3
import os

# 현재 폴더의 soundwave.db 파일 경로
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(BASE_DIR, 'soundwave.db')

def fix_database():
    print(f"📂 데이터베이스 경로: {db_path}")
    
    if not os.path.exists(db_path):
        print("❌ 데이터베이스 파일이 없습니다. 앱을 먼저 실행해서 DB를 생성해주세요.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 컬럼 추가 시도 (이미 있으면 오류 발생하므로 try-except로 감싸거나 무시)
        try:
            cursor.execute("ALTER TABLE music ADD COLUMN image_filename VARCHAR(200)")
        except: pass
        
        try:
            cursor.execute("ALTER TABLE music ADD COLUMN genre VARCHAR(50)")
        except: pass
        
        # 좋아요 테이블 생성
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS likes (
                user_id INTEGER,
                music_id INTEGER,
                PRIMARY KEY (user_id, music_id),
                FOREIGN KEY(user_id) REFERENCES user(id),
                FOREIGN KEY(music_id) REFERENCES music(id)
            )
        """)

        # 리뷰 테이블 생성 (SQLAlchemy가 자동으로 해주지만 수동 복구를 위해)
        # 실제로는 app.py 실행 시 db.create_all()이 처리하므로 여기서는 생략하거나
        # 필요한 경우 추가할 수 있습니다.
        
        conn.commit()
        print("✅ 성공! 데이터베이스가 수정되었습니다.")
        conn.close()
    except Exception as e:
        print(f"ℹ️ 알림: {e} (이미 수정되었거나 파일이 사용 중일 수 있습니다)")

if __name__ == '__main__':
    fix_database()