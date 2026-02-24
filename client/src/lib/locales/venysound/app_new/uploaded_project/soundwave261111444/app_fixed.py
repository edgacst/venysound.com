# -*- coding: utf-8 -*-
from flask import Flask, render_template, request, redirect, flash, url_for, send_from_directory, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime
import os
import os

# ========== 중요! Flask 템플릿 경로 명시적 지정 ==========
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.secret_key = 'soundwave-secret-key-2024'

print(f"✅ Templates 폴더: {app.template_folder}")
print(f"✅ 폴더 존재: {os.path.exists(app.template_folder)}")

# ========== 기존 설정 유지 ==========
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///soundwave.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg'}
db = SQLAlchemy(app)

login_manager = LoginManager(app)
login_manager.login_view = 'login_page'
login_manager.login_message = '로그인이 필요합니다'  # 한글 수정

# ========== 나머지 코드는 그대로 ==========
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///soundwave.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg'}
db = SQLAlchemy(app)


login_manager = LoginManager(app)
login_manager.login_view = 'login_page'
login_manager.login_message = '濡쒓렇?몄씠 ?꾩슂?⑸땲??


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def __repr__(self):
        return f'<User {self.username}>'

class Music(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    artist = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    play_count = db.Column(db.Integer, default=0)
    
    def __repr__(self):
        return f'<Music {self.title}>'

# 濡쒓렇??愿由ъ옄 ?ㅼ젙
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ========== ?좏떥由ы떚 ?⑥닔 ==========
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_music_list():
    """?뚯썝 紐⑸줉 媛?몄삤湲?""
    return Music.query.order_by(Music.created_at.desc()).all()

# ========== ?섏씠吏 ?쇱슦??==========

@app.route('/')
@app.route('/index')
def home():
    """메인 페이지"""
    recent_music = Music.query.order_by(Music.created_at.desc()).limit(5).all()
    return render_template('index.html', recent_music=recent_music, total_count=Music.query.count())

@app.route('/upload')
def upload_page():
    """?낅줈???섏씠吏"""
    return render_template('upload.html')

@app.route('/music')
def music_page():
    """?뚯썝 紐⑸줉 ?섏씠吏"""
    music_list = get_music_list()
    return render_template('music.html', music_list=music_list)

@app.route('/login')
def login_page():
    """濡쒓렇???섏씠吏"""
    return render_template('login.html')

@app.route('/register')
def register_page():
    """?뚯썝媛???섏씠吏"""
    return render_template('register.html')

# ========== API ?쇱슦??==========
@app.route('/api/register', methods=['POST'])
def api_register():
    """?뚯썝媛??API"""
    try:
        data = request.get_json()
        
        # ?꾩닔 ?꾨뱶 ?뺤씤
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'{field} ?꾨뱶???꾩닔?낅땲??}), 400
        
        # 以묐났 ?뺤씤
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': '?대? ?ъ슜以묒씤 ?꾩씠?붿엯?덈떎'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'success': False, 'error': '?대? ?ъ슜以묒씤 ?대찓?쇱엯?덈떎'}), 400
        
        # ?ъ슜???앹꽦
        user = User(username=data['username'], email=data['email'])
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '?뚯썝媛???깃났!',
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
    """濡쒓렇??API"""
    try:
        data = request.get_json()
        
        # ?꾩닔 ?꾨뱶 ?뺤씤
        if not data.get('username') or not data.get('password'):
            return jsonify({'success': False, 'error': '?꾩씠?붿? 鍮꾨?踰덊샇瑜??낅젰?댁＜?몄슂'}), 400
        
        # ?ъ슜??李얘린
        user = User.query.filter_by(username=data['username']).first()
        
        # ?ъ슜???뺤씤 諛?鍮꾨?踰덊샇 寃利?
        if user and user.check_password(data['password']):
            login_user(user, remember=data.get('remember', False))
            
            return jsonify({
                'success': True,
                'message': '濡쒓렇???깃났!',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email
                }
            })
        
        return jsonify({'success': False, 'error': '?꾩씠???먮뒗 鍮꾨?踰덊샇媛 ??몄뒿?덈떎'}), 401
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout')
@login_required
def api_logout():
    """濡쒓렇?꾩썐 API"""
    logout_user()
    return jsonify({'success': True, 'message': '濡쒓렇?꾩썐 ?섏뿀?듬땲??})

@app.route('/api/me')
def api_get_current_user():
    """?꾩옱 濡쒓렇?몃맂 ?ъ슜???뺣낫"""
    if current_user.is_authenticated:
        return jsonify({
            'success': True,
            'user': {
                'id': current_user.id,
                'username': current_user.username,
                'email': current_user.email
            }
        })
    
    return jsonify({'success': False, 'user': None})

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    """?뚯썝 ?낅줈??泥섎━"""
    if 'music' not in request.files:
        flash('?뚯씪???좏깮?댁＜?몄슂', 'error')
        return redirect(url_for('upload_page'))
    
    file = request.files['music']
    title = request.form.get('title', '').strip()
    artist = request.form.get('artist', current_user.username if current_user.is_authenticated else '?????놁쓬').strip()
    
    if not title:
        flash('?뚯썝 ?쒕ぉ???낅젰?댁＜?몄슂', 'error')
        return redirect(url_for('upload_page'))
    
    if file.filename == '':
        flash('?뚯씪???좏깮?댁＜?몄슂', 'error')
        return redirect(url_for('upload_page'))
    
    if file and allowed_file(file.filename):
        # ?덉쟾???뚯씪紐??앹꽦
        original_filename = secure_filename(file.filename)
        name, ext = os.path.splitext(original_filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{name}_{timestamp}{ext}"
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # ?뚯썝 ?뺣낫 ???
        music = Music(
            title=title,
            artist=artist,
            filename=filename,
            user_id=current_user.id if current_user.is_authenticated else None
        )
        
        db.session.add(music)
        db.session.commit()
        
        flash(f'"{title}" ?낅줈???깃났!', 'success')
        return redirect(url_for('music_page'))
    
    flash('MP3, WAV, OGG ?뚯씪留??낅줈??媛?ν빀?덈떎', 'error')
    return redirect(url_for('upload_page'))

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """?낅줈?쒕맂 ?뚯씪 ?쒕튃"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/music')
def api_get_music():
    """?뚯썝 紐⑸줉 API"""
    music_list = get_music_list()
    return jsonify({
        'success': True,
        'music': [
            {
                'id': m.id,
                'title': m.title,
                'artist': m.artist,
                'filename': m.filename,
                'created_at': m.created_at.isoformat(),
                'url': url_for('uploaded_file', filename=m.filename)
            }
            for m in music_list
        ]
    })

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.static_folder),
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon'
    )

# ========== 硫붿씤 ?ㅽ뻾 ==========
if __name__ == '__main__':
    # ?꾩슂???대뜑 ?앹꽦
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    print("?렦" * 30)
    print("   SoundWave ?뚯썝 怨듭쑀 ?뚮옯??)
    print("?렦" * 30)
    print(f"?뱚 ?낅줈???대뜑: {os.path.abspath(app.config['UPLOAD_FOLDER'])}")
    print(f"?뱚 ?곗씠?곕쿋?댁뒪: {os.path.abspath('soundwave.db')}")
    print("?뙋 ?쒕쾭 二쇱냼: http://localhost:5000")
    print("?뱾 ?낅줈???섏씠吏: http://localhost:5000/upload")
    print("?렒 ?뚯썝 紐⑸줉: http://localhost:5000/music")
    print("?뫀 濡쒓렇?? http://localhost:5000/login")
    print("?뱷 ?뚯썝媛?? http://localhost:5000/register")
    print("???쒕쾭 醫낅즺: Ctrl + C")
    print("?렦" * 30)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
