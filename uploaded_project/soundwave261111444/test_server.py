# -*- coding: utf-8 -*-
from app import app

# 간단한 서버 실행 테스트
if __name__ == '__main__':
    print("서버 실행 테스트...")
    app.run(debug=True, port=5001)
