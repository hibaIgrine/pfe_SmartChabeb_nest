import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  // --- 1. CRÉATION (Inscription Mobile) ---
  async create(createUserDto: any) {
    try {
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(createUserDto.mot_de_passe, salt);
      const vCode = Math.floor(1000 + Math.random() * 9000).toString();

      const user = await this.prisma.utilisateurs.create({
        data: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email.trim().toLowerCase(),
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          code_verification: vCode,
          est_verifie: false,
        },
      });

      console.log(`✅ Utilisateur créé : ${user.email}. Code OTP : ${vCode}`);

      // 🏆 ENVOI MAIL AVEC ATTENTE (AWAIT) POUR DIAGNOSTIC
      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'SmartChabeb - Code de vérification',
          html: `
            <div style="font-family: sans-serif; padding: 20px; background-color: #F7F3E9; border-radius: 20px;">
              <h3 style="color: #436D75;">Bienvenue ${user.prenom} !</h3>
              <p>Voici ton code pour activer ton compte SmartChabeb :</p>
              <div style="background-color: white; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center; color: #E98A7D; letter-spacing: 5px;">
                ${vCode}
              </div>
            </div>
          `,
        });
        console.log(`📧 SUCCESS : Email envoyé avec succès à ${user.email}`);
      } catch (mailError) {
        console.error("❌ ERREUR SMTP RÉELLE :", mailError.message);
      }

      return user;
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Cet email est déjà utilisé.');
      throw error;
    }
  }

  // --- 2. MISE À JOUR PROFIL (Gestion Changement Email) ---
  async update(id: string, updateUserDto: any) {
    try {
      const currentUser = await this.prisma.utilisateurs.findUnique({ where: { id } });
      if (!currentUser) throw new UnauthorizedException('Utilisateur non trouvé');

      let status = 'PROFILE_UPDATED';

      if (updateUserDto.email) {
        const newEmail = updateUserDto.email.trim().toLowerCase();
        if (newEmail !== currentUser.email.toLowerCase()) {
          const exists = await this.prisma.utilisateurs.findFirst({
            where: { email: newEmail, NOT: { id: id } }
          });
          if (exists) throw new ConflictException('Email déjà utilisé');

          const vCode = Math.floor(1000 + Math.random() * 9000).toString();
          updateUserDto.code_verification = vCode;
          updateUserDto.est_verifie = false;
          status = 'VERIFY_EMAIL';

          // Await l'envoi du mail pour être sur de voir l'erreur s'il y en a une
          await this.mailerService.sendMail({
            to: newEmail,
            subject: 'SmartChabeb - Validation du nouvel email',
            html: `<h3>Ton nouveau code de vérification : ${vCode}</h3>`,
          }).catch(e => console.error("❌ Erreur mail de mise à jour:", e.message));
        }
      }

      if (updateUserDto.mot_de_passe) {
        const salt = await bcrypt.genSalt();
        updateUserDto.mot_de_passe = await bcrypt.hash(updateUserDto.mot_de_passe, salt);
      } else {
        delete updateUserDto.mot_de_passe;
      }

      const updatedUser = await this.prisma.utilisateurs.update({
        where: { id: id },
        data: updateUserDto,
      });

      return { user: updatedUser, status };
    } catch (error) { throw error; }
  }
async updateRole(id: string, newRole: string) {
// Optionnel : Empêcher de changer son propre rôle pour ne pas s'auto-bloquer
return await this.prisma.utilisateurs.update({
where: { id },
data: { role: newRole },
});
}
  // --- AUTRES MÉTHODES ---
  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!user || user.code_verification !== code) throw new UnauthorizedException('Code incorrect.');
    return await this.prisma.utilisateurs.update({
      where: { email },
      data: { est_verifie: true, code_verification: null },
    });
  }

  async saveBiometrics(dto: any) {
  const user = await this.prisma.utilisateurs.findUnique({ 
    where: { email: dto.email } 
  });

  // 🛡️ SÉCURITÉ : On vérifie si l'utilisateur existe avant d'utiliser son ID
  if (!user) {
    throw new UnauthorizedException('Utilisateur non trouvé pour la biométrie');
  }

  const imc = dto.poids / ((dto.taille / 100) * (dto.taille / 100));
  
  return await this.prisma.suivi_biometrique.create({
    data: {
      id_utilisateur: user.id, // Maintenant TypeScript est sûr que user existe
      poids_kg: dto.poids,
      taille_cm: dto.taille,
      imc: parseFloat(imc.toFixed(2)),
      date_mesure: new Date(),
    },
  });
  }

  async findAll(requesterId?: string, requesterRole?: string) {
    if (requesterRole === 'COACH' && requesterId) {
      const coach = await this.prisma.utilisateurs.findUnique({ where: { id: requesterId }, select: { id_salle: true } });
      if (!coach || !coach.id_salle) return [];
      return await this.prisma.utilisateurs.findMany({
        where: { id_salle: coach.id_salle, role: 'ADHERENT' },
        include: { salles: true, suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 } },
        orderBy: { nom: 'asc' },
      });
    }
    return await this.prisma.utilisateurs.findMany({
      include: {
        salles: { select: { nom: true, gouvernorat: true } },
        _count: { select: { journal_repas: true, programmes_sportifs_programmes_sportifs_id_membreToutilisateurs: true } },
        suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
      },
      orderBy: { nom: 'asc' },
    });
  }

  async updateStatus(id: string, data: any) {
    return await this.prisma.utilisateurs.update({ where: { id }, data });
  }

  async banUser(id: string, days: number, reason: string) {
    const finBan = new Date();
    finBan.setDate(finBan.getDate() + days);
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false, date_fin_ban: finBan, motif_ban: reason },
    });
  }

  async findOne(id: string) {
    return await this.prisma.utilisateurs.findUnique({
      where: { id },
      include: {
        salles: true,
        suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
        programmes_sportifs_programmes_sportifs_id_membreToutilisateurs: {
          orderBy: [{ date_creation: 'desc' }, { id: 'desc' }],
        },
      },
    });
  }
  async updateProfile(email: string, updateProfileDto: any) {
  return await this.prisma.utilisateurs.update({
    where: { email: email },
    data: {
      genre: updateProfileDto.genre,
      date_naissance: new Date(updateProfileDto.date_naissance),
    },
  });
}
  async getProfileWithBiometrics(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      include: {
        salles: true,
        suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
      },
    });
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');
    return user;
  }

  async assignToSalleByEmail(email: string, id_salle: string) {
    return await this.prisma.utilisateurs.update({ where: { email }, data: { id_salle } });
  }

  async remove(id: string) {
    return await this.prisma.utilisateurs.delete({ where: { id } });
  }
}