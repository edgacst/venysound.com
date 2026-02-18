# -*- coding: utf-8 -*-
import requests
import json

BASE_URL = 'http://localhost:5000'

print('🎵 회원가입/로그인 API 테스트 시작...')

# 1. 새 사용자 회원가입 테스트
test_user = {
    'username': 'testuser123',
    'email': 'test123@soundwave.com',
    'password': 'test1234'
}

print('\\n1. 회원가입 테스트...')
try:
    response = requests.post(f'{BASE_URL}/api/register', 
                           json=test_user,
                           headers={'Content-Type': 'application/json'})
    print(f'상태코드: {response.status_code}')
    print(f'응답: {response.json()}')
except Exception as e:
    print(f'❌ 오류: {e}')

# 2. 로그인 테스트
print('\\n2. 로그인 테스트...')
try:
    login_data = {
        'username': 'testuser123',
        'password': 'test1234'
    }
    response = requests.post(f'{BASE_URL}/api/login', 
                           json=login_data,
                           headers={'Content-Type': 'application/json'})
    print(f'상태코드: {response.status_code}')
    print(f'응답: {response.json()}')
except Exception as e:
    print(f'❌ 오류: {e}')

# 3. 현재 사용자 정보 테스트
print('\\n3. 현재 사용자 정보 테스트...')
try:
    response = requests.get(f'{BASE_URL}/api/me')
    print(f'상태코드: {response.status_code}')
    print(f'응답: {response.json()}')
except Exception as e:
    print(f'❌ 오류: {e}')

print('\\n🎵 테스트 완료!')
