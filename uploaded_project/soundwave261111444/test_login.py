# -*- coding: utf-8 -*-
from app import app, db, User

print('로그인 시스템 테스트...')

with app.app_context():
    # 관리자 계정 확인
    admin = User.query.filter_by(username='admin').first()
    if admin:
        print(f'✅ 관리자 계정 확인: {admin.username}')
        
        # 비밀번호 확인 테스트
        try:
            if hasattr(admin, 'check_password'):
                print('✅ check_password 메서드 확인')
            else:
                print('❌ check_password 메서드 없음')
        except:
            print('❌ 메서드 확인 실패')
    else:
        print('❌ 관리자 계정을 찾을 수 없음')
