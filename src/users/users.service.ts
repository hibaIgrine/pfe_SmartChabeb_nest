import {ConflictException,Injectable,UnauthorizedException,} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private mailerService: MailerService,
  ) {}

  async create(createUserDto: any) {
    try {
      // 1. Hachage du mot de passe et génération du code
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(
        createUserDto.mot_de_passe,
        salt,
      );
      const vCode = Math.floor(1000 + Math.random() * 9000).toString();

      // 2. Création de l'utilisateur dans la base de données
      const user = await this.prisma.utilisateurs.create({
        data: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email,
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          code_verification: vCode,
          est_verifie: false,
        },
      });

      console.log(`✅ Utilisateur créé : ${user.email}. Code : ${vCode}`);

      // 3. Envoi du mail (dans un bloc try/catch séparé pour ne pas bloquer si le mail échoue)
      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'Bienvenue chez SmartChabeb - Code de vérification',
          html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px;">
              <h3>Bienvenue ${user.prenom} !</h3>
              <p>Merci de vous être inscrit sur la plateforme SmartChabeb.</p>
              <p>Votre code de vérification est : <b style="font-size: 20px; color: #007bff;">${vCode}</b></p>
              <p>Ce code est nécessaire pour activer votre compte sur l'application mobile.</p>
            </div>
          `,
        });
        console.log(`📧 Email envoyé avec succès à ${user.email}`);
      } catch (mailError) {
        console.error("❌ Erreur d'envoi d'email :", mailError);
        // On ne bloque pas la création du compte si l'email ne part pas,
        // l'admin pourra toujours voir le code dans le terminal ou pgAdmin.
      }

      return user;
    } catch (error) {
      // Gestion de l'erreur email déjà utilisé (P2002 = Unique Constraint dans Prisma)
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Cet email est déjà utilisé par un autre compte.',
        );
      }
      throw error;
    }
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: email },
    });

    if (!user || user.code_verification !== code) {
      throw new UnauthorizedException('Le code de vérification est incorrect.');
    }

    return await this.prisma.utilisateurs.update({
      where: { email: email },
      data: {
        est_verifie: true,
        code_verification: null,
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

  async saveBiometrics(dto: any) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');

    const tailleEnMetres = dto.taille / 100;
    const imcCalculé = dto.poids / (tailleEnMetres * tailleEnMetres);

    return await this.prisma.suivi_biometrique.create({
      data: {
        id_utilisateur: user.id,
        poids_kg: dto.poids,
        taille_cm: dto.taille,
        imc: parseFloat(imcCalculé.toFixed(2)),
        date_mesure: new Date(),
      },
    });
  }

  // src/users/users.service.ts

  async findAll() {
    return await this.prisma.utilisateurs.findMany({
      include: {
        salles: { select: { nom: true, gouvernorat: true } }, // Voir le centre de rattachement
        _count: {
          select: {
            journal_repas: true,
            programmes_sportifs_programmes_sportifs_id_membreToutilisateurs: true,
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  // 1. Fonction GÉNERIQUE par ID (Pour l'Admin Web)
  // Elle peut maintenant changer le rôle, le statut OU la salle d'un coup !
  async updateStatus(id: string, data: any) {
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: data, // accepte n'importe quel champ (role, compte_actif, id_salle...)
    });
  }
  async updateRole(id: string, newRole: string) {
    // Optionnel : Empêcher de changer son propre rôle pour ne pas s'auto-bloquer
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { role: newRole },
    });
  }

  async banUser(id: string, days: number, reason: string) {
    const finBan = new Date();
    finBan.setDate(finBan.getDate() + days); // On ajoute X jours à aujourd'hui

    return await this.prisma.utilisateurs.update({
      where: { id },
      data: {
        compte_actif: false,
        date_fin_ban: finBan,
        motif_ban: reason,
      },
    });
  }

  async findOne(id: string) {
    return await this.prisma.utilisateurs.findUnique({
      where: { id: id },
    });
  }
  // REMPLACE TA MÉTHODE PAR CELLE-CI (Version Excellence 🏆)
  async update(id: string, updateUserDto: any) {
    try {
      // 1. On récupère d'abord l'utilisateur actuel dans la base
      const currentUser = await this.prisma.utilisateurs.findUnique({
        where: { id: id },
      });

      if (!currentUser)
        throw new UnauthorizedException('Utilisateur non trouvé');

      // 2. VÉRIFICATION INTELLIGENTE DE L'EMAIL
      if (updateUserDto.email) {
        const newEmail = updateUserDto.email.trim().toLowerCase();

        // SI l'email est différent de l'ancien, ALORS on vérifie s'il est pris
        if (newEmail !== currentUser.email.toLowerCase()) {
          const emailOccupé = await this.prisma.utilisateurs.findUnique({
            where: { email: newEmail },
          });

          if (emailOccupé) {
            throw new ConflictException(
              'Cet email appartient déjà à un autre membre.',
            );
          }
        }
      }

      // 3. SÉCURITÉ DU MOT DE PASSE
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

      // 4. MISE À JOUR FINALE
      return await this.prisma.utilisateurs.update({
        where: { id: id },
        data: {
          ...updateUserDto,
          email: updateUserDto.email?.trim().toLowerCase(),
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      console.error('Erreur technique update:', error);
      throw new Error('Impossible de mettre à jour votre profil.');
    }
  }
  async remove(id: string) {
    return await this.prisma.utilisateurs.delete({
      where: { id: id },
    });
  }
  async getProfileWithBiometrics(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      include: {
        salles: true,
        suivi_biometrique: {
          orderBy: { date_mesure: 'desc' },
          take: 1,
        }, // Ceci va inclure la liste des mesures de l'utilisateur
      },
    });

    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');
    return user;
  }
  async assignToSalleByEmail(email: string, id_salle: string) {
    return await this.prisma.utilisateurs.update({
      where: { email: email },
      data: { id_salle: id_salle },
    });
  }
}
