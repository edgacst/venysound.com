import os

print("🔍 경로 디버깅")
print("="*50)

# 현재 경로들
print(f"현재 작업 디렉토리: {os.getcwd()}")
print(f"app.py 위치: {os.path.dirname(os.path.abspath(__file__))}")

# templates 폴더 확인
templates_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
print(f"\n📁 Templates 절대 경로: {templates_path}")
print(f"📁 폴더 존재: {os.path.exists(templates_path)}")

if os.path.exists(templates_path):
    print("📄 파일들:")
    for f in os.listdir(templates_path):
        print(f"  - {f}")

# Flask가 보는 경로 테스트
print(f"\n🔧 Flask 테스트:")
try:
    from flask import Flask
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    test_app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'))
    print(f"✅ Flask 템플릿 폴더: {test_app.template_folder}")
except Exception as e:
    print(f"❌ Flask 테스트 실패: {e}")
