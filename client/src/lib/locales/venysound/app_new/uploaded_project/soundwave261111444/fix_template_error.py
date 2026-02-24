import os

# app.py 읽기
with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# import 부분 확인/추가
import_added = False
for i, line in enumerate(lines):
    if 'import os' in line:
        import_added = True
        break

if not import_added:
    # import 부분 찾기
    for i, line in enumerate(lines):
        if line.startswith('from ') or line.startswith('import '):
            lines.insert(i, 'import os\n')
            import_added = True
            break

# Flask() 호출 부분 찾기 및 수정
for i, line in enumerate(lines):
    if 'app = Flask(' in line:
        # 원래 줄 주석 처리
        lines[i] = f'# {line}'
        # 새 줄 추가
        new_line = '''app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'))\n'''
        lines.insert(i + 1, new_line)
        break

# 저장
with open('app_fixed.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✅ app_fixed.py 생성 완료!")
print("실행: python app_fixed.py")
print("접속: http://localhost:5000")
