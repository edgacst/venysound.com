from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask import Flask, render_template, request, redirect, flash, url_for, send_from_directory
import os
from werkzeug.utils import secure_filename
from datetime import datetime
# 기존 import 아래에 추가
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, template_folder='templates')
app.secret_key = 'soundwave-secret-key-2024'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///soundwave.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # 로그인 페이지 이름
login_manager.login_message = '로그인이 필요합니다'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
# ====== 여기에 Music 모델 추가 ======
class Music(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    artist = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<Music {self.title}>'
# User 모델 정의 (db = SQLAlchemy(app) 밑에 추가)
class User(UserMixin, db.Model):  # UserMixin 추가
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    # 비밀번호 설정 메서드
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    # 비밀번호 확인 메서드
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg'}
app.config['MUSIC_DATA_FILE'] = 'music_data.txt'

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def save_music_info(title, artist, filename):
    """음원 정보를 파일에 저장"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(app.config['MUSIC_DATA_FILE'], 'a', encoding='utf-8') as f:
        f.write(f"{title}|{artist}|{filename}|{timestamp}\n")

def load_music_list():
    """음원 목록 불러오기"""
    music_list = []
    if os.path.exists(app.config['MUSIC_DATA_FILE']):
        with open(app.config['MUSIC_DATA_FILE'], 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    parts = line.strip().split('|')
                    if len(parts) >= 4:
                        music_list.append({
                            'title': parts[0],
                            'artist': parts[1],
                            'filename': parts[2],
                            'timestamp': parts[3],
                            'url': url_for('uploaded_file', filename=parts[2])
                        })
    return music_list

@app.route('/')
def home():
    music_list = load_music_list()[:5]  # 최근 5개만 홈에 표시
    return render_template('index.html', recent_music=music_list, total_count=len(load_music_list()))

@app.route('/upload')
def upload_page():
    return render_template('upload.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'music' not in request.files:
        flash('❌ 파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    file = request.files['music']
    title = request.form.get('title', '').strip()
    artist = request.form.get('artist', '알 수 없음').strip()
    
    if not title:
        flash('❌ 음원 제목을 입력해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file.filename == '':
        flash('❌ 파일을 선택해주세요', 'error')
        return redirect(url_for('upload_page'))
    
    if file and allowed_file(file.filename):
        # 안전한 파일명 생성
        original_filename = secure_filename(file.filename)
        name, ext = os.path.splitext(original_filename)
        
        # 중복 방지를 위한 타임스탬프 추가
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{name}_{timestamp}{ext}"
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # 음원 정보 저장
        save_music_info(title, artist, filename)
        
        flash(f'🎉 "{title}" 업로드 완료!', 'success')
        return redirect(url_for('music_page'))
    
    flash('❌ MP3, WAV, OGG 파일만 업로드 가능합니다', 'error')
    return redirect(url_for('upload_page'))

@app.route('/music')
def music_page():
    music_list = load_music_list()
    return render_template('music.html', music_list=music_list)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/delete/<filename>', methods=['POST'])
def delete_file(filename):
    try:
        # 파일 삭제
        filepath = os.path.join(app.config['UPLIC_UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # 데이터에서 삭제
        temp_file = 'music_data_temp.txt'
        if os.path.exists(app.config['MUSIC_DATA_FILE']):
            with open(app.config['MUSIC_DATA_FILE'], 'r', encoding='utf-8') as f_in, \
                 open(temp_file, 'w', encoding='utf-8') as f_out:
                for line in f_in:
                    parts = line.strip().split('|')
                    if len(parts) >= 3 and parts[2] != filename:
                        f_out.write(line)
            
            os.replace(temp_file, app.config['MUSIC_DATA_FILE'])
        
        flash('🗑️ 음원 삭제 완료', 'success')
    except Exception as e:
        flash(f'❌ 삭제 실패: {str(e)}', 'error')
    
    return redirect(url_for('music_page'))
# /register 라우트를 찾아서 그 밑에 추가하거나
# 적절한 위치에 다음 코드 추가:

@app.route('/api/register', methods=['POST'])
def api_register():
    """회원가입 API"""
    try:
        data = request.get_json()
        
        # 필수 필드 확인
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} 필드는 필수입니다'}), 400
        
        # 중복 확인
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 아이디입니다'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '이미 사용중인 이메일입니다'}), 400
        
        # 사용자 생성
        user = User(
            username=data['username'],
            email=data['email']
        )
        user.set_password(data['password'])  # 비밀번호 해시 저장
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '회원가입 성공!',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        }), 201
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/login', methods=['POST'])
def api_login():
    """로그인 API"""
    try:
        data = request.get_json()
        
        # 필수 필드 확인
        if not data.get('username') or not data.get('password'):
            return jsonify({'success': False, 'error': '아이디와 비밀번호를 입력해주세요'}), 400
        
        # 사용자 찾기
        user = User.query.filter_by(username=data['username']).first()
        
        # 사용자 확인 및 비밀번호 검증
        if user and user.check_password(data['password']):
            login_user(user, remember=data.get('remember', False))
            
            return jsonify({
                'success': True,
                'message': '로그인 성공!',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email
                }
            })
        
        return jsonify({'success': False, 'error': '아이디 또는 비밀번호가 틀렸습니다'}), 401
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # 필수 폴더 생성
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    print("🎵" * 30)
    print("   SoundWave 음원 공유 플랫폼")
    print("🎵" * 30)
    print(f"📁 업로드 폴더: {os.path.abspath(app.config['UPLOAD_FOLDER'])}")
    print(f"📄 데이터 파일: {app.config['MUSIC_DATA_FILE']}")
    print("🌐 서버 주소: http://localhost:5000")
    print("📤 업로드 페이지: http://localhost:5000/upload")
    print("🎧 음원 목록: http://localhost:5000/music")
    print("⚡ 서버 종료: Ctrl + C")
    print("🎵" * 30)
    
    app.run(debug=True, host='0.0.0.0', port=5000)