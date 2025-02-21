const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://anderson:152070@database.o6gmd.mongodb.net/test?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'WPYvz*z_ZC5L:?mW.:,MPJ$_U?RD8X';
const VALID_REGISTRATION_CODE = process.env.REGISTRATION_CODE || 'BOAPARTE2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Erro no middleware:', err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            valid: false,
            message: 'Dados inválidos na requisição.'
        });
    }
    next();
});

// MongoDB Connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado ao MongoDB - Database: test');
    } catch (err) {
        console.error('Erro ao conectar ao MongoDB:', err);
        // Retry connection after 5 seconds
        setTimeout(connectDB, 5000);
    }
};

connectDB();

// User Schema
const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true
    },
    password: { 
        type: String, 
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    owner: {
        type: String
    },
    username: {
        type: String
    },
    birthday: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema, 'users');
const Contact = mongoose.model('Contact', contactSchema, 'contacts');

// Lista de tokens inválidos
let invalidTokens = new Set();

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token não fornecido' 
            });
        }

        if (invalidTokens.has(token)) {
            return res.status(401).json({
                success: false,
                message: 'Token invalidado'
            });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Token inválido ou expirado' 
                });
            }

            req.user = decoded;
            next();
        });
    } catch (error) {
        console.error('Erro na autenticação:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
};

// Função para verificar se é admin
function isAdmin(username) {
    return username === 'Anderson';
}

// Rota de login
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username e senha são obrigatórios'
            });
        }

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Senha incorreta'
            });
        }

        const token = jwt.sign(
            { username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            username: user.username
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota de registro
app.post("/register", async (req, res) => {
    try {
        const { username, password, registrationCode } = req.body;

        if (!username || !password || !registrationCode) {
            return res.status(400).json({
                success: false,
                message: 'Todos os campos são obrigatórios'
            });
        }

        if (registrationCode !== VALID_REGISTRATION_CODE) {
            return res.status(401).json({
                success: false,
                message: 'Código de registro inválido'
            });
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username já está em uso'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            username,
            password: hashedPassword
        });

        await user.save();

        res.json({
            success: true,
            message: 'Usuário registrado com sucesso'
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota para obter contatos
app.get('/api/contacts', authenticateToken, async (req, res) => {
    try {
        let contacts;
        if (isAdmin(req.user.username)) {
            contacts = await Contact.find().sort({ createdAt: -1 });
        } else {
            contacts = await Contact.find({ username: req.user.username }).sort({ createdAt: -1 });
        }

        res.json({
            success: true,
            contacts: contacts
        });
    } catch (error) {
        console.error('Erro ao listar contatos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar contatos'
        });
    }
});

// Rota para obter contatos do mês atual
app.get('/api/contacts/month', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const contacts = await Contact.find({
            createdAt: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        }).sort({ createdAt: -1 });

        res.json(contacts);
    } catch (error) {
        console.error('Erro ao buscar contatos do mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar contatos do mês'
        });
    }
});

// Rota para obter contatos por mês específico
app.get('/api/contacts/month/:month', authenticateToken, async (req, res) => {
    try {
        const month = parseInt(req.params.month);
        
        if (isNaN(month) || month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                message: 'Mês inválido'
            });
        }

        const year = new Date().getFullYear();
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        let query = {
            birthday: {
                $gte: startDate,
                $lte: endDate
            }
        };

        // Se não for admin, filtrar apenas os contatos do usuário
        if (!isAdmin(req.user.username)) {
            query.username = req.user.username;
        }

        const contacts = await Contact.find(query).sort({ birthday: 1 });

        res.json({
            success: true,
            contacts: contacts
        });
    } catch (error) {
        console.error('Erro ao buscar contatos do mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar contatos do mês'
        });
    }
});

// Rota para adicionar contato
app.post("/api/contacts", authenticateToken, async (req, res) => {
    try {
        const { name, phone, birthday } = req.body;
        
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Nome e telefone são obrigatórios'
            });
        }

        const contact = new Contact({
            name,
            phone,
            birthday: birthday || null,
            owner: req.user.username,
            username: req.user.username
        });

        await contact.save();

        res.json({
            success: true,
            message: 'Contato adicionado com sucesso',
            contact
        });
    } catch (error) {
        console.error('Erro ao adicionar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao adicionar contato'
        });
    }
});

// Rota para atualizar contato
app.put("/api/contacts/:id", authenticateToken, async (req, res) => {
    try {
        const { name, phone, birthday } = req.body;
        const contactId = req.params.id;

        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Nome e telefone são obrigatórios'
            });
        }

        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contato não encontrado'
            });
        }

        if (contact.owner !== req.user.username && !isAdmin(req.user.username)) {
            return res.status(403).json({
                success: false,
                message: 'Não autorizado a editar este contato'
            });
        }

        contact.name = name;
        contact.phone = phone;
        contact.birthday = birthday || contact.birthday;

        await contact.save();

        res.json({
            success: true,
            message: 'Contato atualizado com sucesso',
            contact
        });
    } catch (error) {
        console.error('Erro ao atualizar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar contato'
        });
    }
});

// Rota para deletar contato
app.delete("/api/contacts/:id", authenticateToken, async (req, res) => {
    try {
        const contactId = req.params.id;
        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contato não encontrado'
            });
        }

        if (contact.owner !== req.user.username && !isAdmin(req.user.username)) {
            return res.status(403).json({
                success: false,
                message: 'Não autorizado a deletar este contato'
            });
        }

        await Contact.findByIdAndDelete(contactId);

        res.json({
            success: true,
            message: 'Contato deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao deletar contato'
        });
    }
});

// Rota para listar usuários (apenas admin)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        if (!isAdmin(req.user.username)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const users = await User.find({}, { password: 0 });
        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar usuários'
        });
    }
});

// Rota para deletar usuário (apenas admin)
app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    try {
        if (!isAdmin(req.user.username)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const username = req.params.username;
        
        if (username.toLowerCase() === 'anderson') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível deletar o usuário administrador'
            });
        }

        const result = await User.findOneAndDelete({ username: username });
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuário deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao deletar usuário'
        });
    }
});

// Rota de logout
app.post('/logout', authenticateToken, (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        invalidTokens.add(token);
        
        res.json({
            success: true,
            message: 'Logout realizado com sucesso'
        });
    } catch (error) {
        console.error('Erro no logout:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao realizar logout'
        });
    }
});

// Serve o arquivo index.html para todas as rotas não encontradas
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
