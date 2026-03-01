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

  // On ajoute les paramètres optionnels pour identifier celui qui fait la requête
  async findAll(requesterId?: string, requesterRole?: string) {
    try {
      // 🛡️ CAS DU COACH : Il ne voit que les ADHÉRENTS de sa PROPRE salle
      if (requesterRole === 'COACH' && requesterId) {
        const coach = await this.prisma.utilisateurs.findUnique({
          where: { id: requesterId },
          select: { id_salle: true },
        });

        if (!coach || !coach.id_salle) return []; // Si le coach n'a pas de salle, liste vide

        return await this.prisma.utilisateurs.findMany({
          where: {
            id_salle: coach.id_salle,
            role: 'ADHERENT', // Un coach ne gère que les jeunes
          },
          include: {
            salles: { select: { nom: true, gouvernorat: true } },
            suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
          },
          orderBy: { nom: 'asc' },
        });
      }

      // 🛡️ CAS DE L'ADMIN : Il voit TOUT le monde (Staff + Adhérents)
      return await this.prisma.utilisateurs.findMany({
        include: {
          salles: { select: { nom: true, gouvernorat: true } },
          _count: {
            select: {
              journal_repas: true,
              programmes_sportifs_programmes_sportifs_id_membreToutilisateurs: true,
            },
          },
          suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
        },
        orderBy: { nom: 'asc' },
      });
    } catch (error) {
      console.error('Erreur findAll Users:', error);
      return [];
    }
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
      if (!id) throw new UnauthorizedException('ID utilisateur manquant');

      // 1. Récupérer l'utilisateur actuel pour comparer les données
      const currentUser = await this.prisma.utilisateurs.findUnique({
        where: { id },
      });
      if (!currentUser)
        throw new UnauthorizedException('Utilisateur non trouvé');

      let status = 'PROFILE_UPDATED'; // Message par défaut pour le front

      // 2. Logique intelligente pour l'EMAIL
      if (updateUserDto.email) {
        const emailNettoyé = updateUserDto.email.trim().toLowerCase();

        // Si l'email a changé par rapport à l'ancien
        if (emailNettoyé !== currentUser.email.toLowerCase()) {
          // Vérifier si le nouvel email n'est pas déjà pris par quelqu'un d'autre
          const doublon = await this.prisma.utilisateurs.findFirst({
            where: { email: emailNettoyé, NOT: { id: id } },
          });

          if (doublon) {
            throw new ConflictException(
              'Cet email est déjà utilisé par un autre compte.',
            );
          }

          // --- ACTION SMART : PRÉPARER LA RE-VÉRIFICATION ---
          const vCode = Math.floor(1000 + Math.random() * 9000).toString();
          updateUserDto.email = emailNettoyé;
          updateUserDto.code_verification = vCode;
          updateUserDto.est_verifie = false; // Le compte repasse en "non vérifié"
          status = 'VERIFY_EMAIL'; // On signalera au mobile d'ouvrir la modale OTP

          // Envoi du mail avec le nouveau code
          try {
            await this.mailerService.sendMail({
              to: emailNettoyé,
              subject: 'SmartChabeb - Validation du nouvel email',
              html: `<h3>Ton nouveau code de vérification est : ${vCode}</h3>`,
            });
          } catch (e) {
            console.error("Erreur d'envoi du mail de mise à jour");
          }
        }
      }

      // 3. Hachage du mot de passe (si fourni)
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

      // 4. Mise à jour finale (incluant le champ photo_profil_url s'il est dans le DTO)
      const updatedUser = await this.prisma.utilisateurs.update({
        where: { id: id },
        data: updateUserDto, // Contient nom, prenom, email, photo_profil_url, etc.
      });

      // On retourne l'utilisateur ET le statut pour aider Flutter à décider quoi afficher
      return {
        user: updatedUser,
        status: status,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      console.error('Erreur technique update:', error);
      throw new Error('Erreur de mise à jour');
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
  async findMembersByCoachSalle(coachId: string) {
    // 1. On cherche le coach
    const coach = await this.prisma.utilisateurs.findUnique({
      where: { id: coachId },
      select: { id_salle: true },
    });

    // 🛡️ SÉCURITÉ : On vérifie si 'coach' existe
    if (!coach) {
      throw new UnauthorizedException('Coach non trouvé ou non autorisé.');
    }

    // 2. Maintenant TypeScript sait que coach n'est pas null
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_salle: coach.id_salle,
        role: 'ADHERENT',
      },
      include: {
        suivi_biometrique: { orderBy: { date_mesure: 'desc' }, take: 1 },
      },
    });
  }
}
