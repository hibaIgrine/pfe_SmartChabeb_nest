import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  // ==========================================
  // 1. CRÉATION (Inscription Mobile Adhérent)
  // ==========================================
  async create(createUserDto: any) {
    try {
      const roleObj = await this.prisma.roles.findUnique({
        where: { nom: 'ADHERENT' },
      });
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(
        createUserDto.mot_de_passe,
        salt,
      );
      const vCode = Math.floor(1000 + Math.random() * 9000).toString();

      const user = await this.prisma.utilisateurs.create({
        data: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email.trim().toLowerCase(),
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          id_role: roleObj?.id,
          code_verification: vCode,
          est_verifie: false,
        },
      });
      console.log(
        `\n🚀 [INSCRIPTION] Nouveau code OTP pour ${user.email} : ${vCode}\n`,
      );
      // Envoi du mail de bienvenue institutionnel
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
      } catch (mailError: unknown) {
        const message =
          mailError instanceof Error ? mailError.message : String(mailError);
        console.error('❌ ERREUR ENVOI MAIL :', message);
      }

      return user;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Cet email est déjà utilisé.');
      }
      throw error;
    }
  }

  // ==========================================
  // 2. GESTION DU PROFIL & STATUTS
  // ==========================================
  async update(id: string, updateUserDto: any) {
    const currentUser = await this.prisma.utilisateurs.findUnique({
      where: { id },
    });
    if (!currentUser) throw new UnauthorizedException('Utilisateur non trouvé');

    let status = 'PROFILE_UPDATED';

    // Sécurité Mot de passe
    if (
      updateUserDto.mot_de_passe &&
      updateUserDto.mot_de_passe.trim() !== ''
    ) {
      const salt = await bcrypt.genSalt();
      updateUserDto.mot_de_passe = await bcrypt.hash(
        updateUserDto.mot_de_passe,
        salt,
      );
    } else {
      delete updateUserDto.mot_de_passe;
    }

    const updatedUser = await this.prisma.utilisateurs.update({
      where: { id },
      data: updateUserDto,
    });

    return { user: updatedUser, status };
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user || user.code_verification !== code)
      throw new UnauthorizedException('Code incorrect.');

    return await this.prisma.utilisateurs.update({
      where: { email },
      data: { est_verifie: true, code_verification: null },
    });
  }
  // src/users/users.service.ts

  async updateProfile(email: string, updateProfileDto: any) {
    try {
      const user = await this.prisma.utilisateurs.update({
        where: { email: email.toLowerCase().trim() },
        data: {
          genre: updateProfileDto.genre,
          // On s'assure que la date est bien un objet Date
          date_naissance: new Date(updateProfileDto.date_naissance),
        },
      });
      return user;
    } catch (error) {
      console.error('Erreur updateProfile:', error);
      throw new UnauthorizedException('Impossible de mettre à jour le profil');
    }
  }

  // ==========================================
  // 3. RECHERCHE ET LISTES (ADMIN & COACH)
  // ==========================================
  async findAll(requesterId?: string, requesterRole?: string) {
    try {
      // 🛡️ CAS DU RESPONSABLE / COACH : Filtrage par centre
      if (requesterRole === 'COACH' && requesterId) {
        const coach = await this.prisma.utilisateurs.findUnique({
          where: { id: requesterId },
          select: { id_centre: true },
        });

        if (!coach || !coach.id_centre) return [];

        return await this.prisma.utilisateurs.findMany({
          where: { id_centre: coach.id_centre, role: 'ADHERENT' },
          include: {
            centre: true,
            inscriptions_clubs: { include: { club: true } },
            clubs_diriges: {
              select: { id: true, nom: true },
            },
          },
          orderBy: { nom: 'asc' },
        });
      }

      // 🛡️ CAS DE L'ADMIN : Vue globale
      return await this.prisma.utilisateurs.findMany({
        include: {
          centre: {
            select: { id: true, nom: true, gouvernorat: true },
          },
          inscriptions_clubs: { include: { club: true } },
          clubs_diriges: {
            select: { id: true, nom: true },
          },
        },
        orderBy: { nom: 'asc' },
      });
    } catch (error) {
      console.error('Erreur findAll Users:', error);
      return [];
    }
  }

  async findOne(id: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id },
      include: {
        centre: true,
        inscriptions_clubs: { include: { club: true } },
        clubs_diriges: {
          select: { id: true, nom: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  // ==========================================
  // 4. ACTIONS ADMINISTRATIVES (Ban, Role, Centre)
  // ==========================================
  async banUser(id: string, days: number, reason: string) {
    const finBan = new Date();
    finBan.setDate(finBan.getDate() + days);
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false, date_fin_ban: finBan, motif_ban: reason },
    });
  }

  async updateStatus(id: string, data: any) {
    if (data.role) {
      const roleName = data.role.toUpperCase().replace(/\s+/g, '_');
      const roleObj = await this.prisma.roles.findUnique({
        where: { nom: roleName },
      });
      data.role = roleName;
      data.id_role = roleObj?.id; // 💡 On met à jour l'UUID en même temps que le texte
    }
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: data,
      include: {
        centre: true,
        inscriptions_clubs: { include: { club: true } },
      },
    });
  }

  async assignToCentreByEmail(email: string, id_centre: string) {
    return await this.prisma.utilisateurs.update({
      where: { email },
      data: { id_centre },
    });
  }

  async findStaffByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_centre,
      },
      select: { id: true, nom: true, prenom: true, email: true, role: true },
    });
  }

  async remove(id: string) {
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false },
    });
  }
}
