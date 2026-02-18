# -*- coding: utf-8 -*-
from flask import Flask, render_template
import os

print("🔍 Flask 템플릿 로더 테스트")
print("="*50)

# 현재 경로
current_dir = os.getcwd()
templates_dir = os.path.join(current_dir, 'templates')

print(f"현재 디렉토리: {current_dir}")
print(f"Templates 폴더: {templates_dir}")
print(f"폴더 존재: {os.path.exists(templates_dir)}")

if os.path.exists(templates_dir):
    print(f"\n📁 파일들:")
    for f in os.listdir(templates_dir):
        print(f"  - {f}")
    
    # Flask 앱 생성
    app = Flask(__name__, template_folder=templates_dir)
    
    print(f"\n🎯 Flask 템플릿 폴더: {app.template_folder}")
    
    # 각 파일 로드 테스트
    with app.app_context():
        files_to_test = ['index.html', 'login.html', 'register.html']
        
        for file_name in files_to_test:
            try:
                # render_template 테스트
                from flask import _app_ctx_stack
                ctx = _app_ctx_stack.top
                template = ctx.app.jinja_env.get_template(file_name)
                print(f"  ✅ {file_name}: 로드 성공")
            except Exception as e:
                print(f"  ❌ {file_name}: 로드 실패 - {str(e)[:100]}")
    
else:
    print("❌ templates 폴더가 없습니다!")

print("\n🎯 테스트 완료")
