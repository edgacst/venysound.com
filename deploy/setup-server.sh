#!/bin/bash
# ================================================================
# venysound.com VPS 초기 서버 설치 스크립트
# Ubuntu 22.04 LTS 기준
# 사용법: sudo bash setup-server.sh
# ================================================================
set -e

echo "========================================"
echo "  venysound.com 서버 초기 설치 시작"
echo "========================================"

# 1. 시스템 업데이트
echo "[1/9] 시스템 패키지 업데이트..."
apt-get update -y && apt-get upgrade -y

# 2. Node.js 18 설치
echo "[2/9] Node.js 18 설치..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
node -v && npm -v

# 3. PM2 전역 설치
echo "[3/9] PM2 설치..."
npm install -g pm2

# 4. PostgreSQL 설치
echo "[4/9] PostgreSQL 설치..."
apt-get install -y postgresql postgresql-contrib

# PostgreSQL 시작 및 자동시작 설정
systemctl start postgresql
systemctl enable postgresql

# DB 및 사용자 생성
echo "[4-1] PostgreSQL DB 생성..."
sudo -u postgres psql <<EOF
CREATE USER venysound WITH PASSWORD 'venysound_pw_change_this';
CREATE DATABASE venysound OWNER venysound;
GRANT ALL PRIVILEGES ON DATABASE venysound TO venysound;
\c venysound
GRANT ALL ON SCHEMA public TO venysound;
EOF

# 5. Nginx 설치
echo "[5/9] Nginx 설치..."
apt-get install -y nginx
systemctl start nginx
systemctl enable nginx

# 6. Certbot (Let's Encrypt SSL) 설치
echo "[6/9] Certbot 설치..."
apt-get install -y certbot python3-certbot-nginx

# 7. 프로젝트 폴더 생성
echo "[7/9] 프로젝트 폴더 생성..."
mkdir -p /var/www/venysound
mkdir -p /var/log/venysound
mkdir -p /var/www/venysound/local-uploads/uploads
chown -R $USER:$USER /var/www/venysound
chown -R $USER:$USER /var/log/venysound

# 8. 방화벽 설정
echo "[8/9] 방화벽 설정..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 9. PM2 부팅 시 자동 시작 설정
echo "[9/9] PM2 자동 시작 설정..."
pm2 startup systemd -u $USER --hp /home/$USER | tail -1 | bash || true

echo ""
echo "========================================"
echo "  설치 완료!"
echo "========================================"
echo ""
echo "다음 단계:"
echo "  1. /var/www/venysound 폴더에 프로젝트 파일 업로드"
echo "  2. /var/www/venysound/.env 파일 생성 (.env.example 참고)"
echo "  3. npm install && npm run build 실행"
echo "  4. npm run db:push 로 DB 스키마 생성"
echo "  5. Nginx 설정 파일 복사:"
echo "     cp deploy/nginx.conf /etc/nginx/sites-available/venysound.com"
echo "     ln -s /etc/nginx/sites-available/venysound.com /etc/nginx/sites-enabled/"
echo "     nginx -t && systemctl reload nginx"
echo "  6. SSL 인증서 발급:"
echo "     certbot --nginx -d venysound.com -d www.venysound.com"
echo "  7. PM2 앱 시작:"
echo "     pm2 start ecosystem.config.cjs --env production"
echo "     pm2 save"
echo ""
echo "PostgreSQL 접속 정보:"
echo "  DB명: venysound"
echo "  사용자: venysound"
echo "  비밀번호: venysound_pw_change_this  ← 반드시 변경하세요!"
