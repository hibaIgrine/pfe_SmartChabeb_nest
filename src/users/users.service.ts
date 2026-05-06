import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';
import { EtablissementsService } from 'src/etablissements/etablissements.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private mailerService: MailerService,
    private etablissementsService: EtablissementsService,
  ) {}

  private resolveBadge(points: number) {
    if (points >= 500) {
      return {
        key: 'LEGEND',
        label: 'Legende',
        minPoints: 500,
      };
    }
    if (points >= 250) {
      return {
        key: 'ELITE',
        label: 'Elite',
        minPoints: 250,
      };
    }
    if (points >= 100) {
      return {
        key: 'ACTIVE',
        label: 'Actif',
        minPoints: 100,
      };
    }
    return {
      key: 'STARTER',
      label: 'Debutant',
      minPoints: 0,
    };
  }

  private resolveNextBadge(points: number) {
    const nextThreshold =
      points < 100 ? 100 : points < 250 ? 250 : points < 500 ? 500 : null;
    if (!nextThreshold) {
      return {
        label: 'Maximum atteint',
        targetPoints: null,
        remainingPoints: 0,
        progressPercent: 100,
      };
    }

    const previousThreshold =
      nextThreshold === 100 ? 0 : nextThreshold === 250 ? 100 : 250;
    const span = nextThreshold - previousThreshold;
    const currentInSpan = Math.max(points - previousThreshold, 0);
    const progressPercent = Math.min(
      100,
      Math.round((currentInSpan / span) * 100),
    );

    return {
      label:
        nextThreshold === 100
          ? 'Actif'
          : nextThreshold === 250
            ? 'Elite'
            : 'Legende',
      targetPoints: nextThreshold,
      remainingPoints: Math.max(nextThreshold - points, 0),
      progressPercent,
    };
  }

  async getGamificationProfile(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        photo_profil_url: true,
        points: true,
        id_centre: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const points = user.points ?? 0;
    const badge = this.resolveBadge(points);
    const nextBadge = this.resolveNextBadge(points);

    const rankScopeWhere = {
      compte_actif: true,
      ...(user.id_centre ? { id_centre: user.id_centre } : {}),
    };

    const higherCount = await this.prisma.utilisateurs.count({
      where: {
        ...rankScopeWhere,
        points: { gt: points },
      },
    });

    return {
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        photo_profil_url: user.photo_profil_url,
      },
      points,
      badge,
      nextBadge,
      rank: higherCount + 1,
    };
  }

  async getGamificationLeaderboard(userId: string, limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 3), 50);

    const requester = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id_centre: true, role: true },
    });

    const leaderboardScopeWhere = {
      compte_actif: true,
      ...(requester?.role !== 'ADMIN' && requester?.id_centre
        ? { id_centre: requester.id_centre }
        : {}),
    };

    const effectiveLimit = requester?.role === 'ADMIN' ? 1000 : safeLimit;

    const leaderboard = await this.prisma.utilisateurs.findMany({
      where: leaderboardScopeWhere,
      select: {
        id: true,
        nom: true,
        prenom: true,
        points: true,
        photo_profil_url: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
      },
      orderBy: [{ points: 'desc' }, { nom: 'asc' }],
      take: effectiveLimit,
    });

    return leaderboard.map((item, index) => {
      const points = item.points ?? 0;
      return {
        rank: index + 1,
        id: item.id,
        nom: item.nom,
        prenom: item.prenom,
        photo_profil_url: item.photo_profil_url,
        points,
        badge: this.resolveBadge(points),
        centre: item.centre,
      };
    });
  }

  // ==========================================
  // 1. CRÉATION (Inscription Mobile Adhérent)
  // ==========================================

  // Vérifie si un email est disponible
  async checkEmailAvailable(email: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    return { available: !user };
  }

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
      const vCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Transform date_naissance from YYYY-MM-DD to ISO DateTime if needed
      let dateNaissance: Date | undefined = undefined;
      if (createUserDto.date_naissance) {
        const dateStr = createUserDto.date_naissance;
        if (
          typeof dateStr === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ) {
          dateNaissance = new Date(dateStr + 'T00:00:00Z');
        } else {
          dateNaissance = new Date(createUserDto.date_naissance);
        }
      }

      // Use upsert: if user already exists (created during email verification), update with profile info
      // Otherwise, create new user
      const user = await this.prisma.utilisateurs.upsert({
        where: { email: createUserDto.email.trim().toLowerCase() },
        update: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          mot_de_passe: hashedPassword,
          genre: createUserDto.genre || null,
          date_naissance: dateNaissance || null,
          id_centre: createUserDto.id_centre || null,
        },
        create: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email.trim().toLowerCase(),
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          id_role: roleObj?.id,
          code_verification: vCode,
          est_verifie: true, // Email est déjà vérifié avant signup
          genre: createUserDto.genre || null,
          date_naissance: dateNaissance || null,
          id_centre: createUserDto.id_centre || null,
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

    const status = 'PROFILE_UPDATED';

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

    // Gestion de etablissement_etude: créer ou trouver
    if (updateUserDto.etablissement_etude !== undefined) {
      if (
        updateUserDto.etablissement_etude &&
        updateUserDto.etablissement_etude.trim() !== ''
      ) {
        const etab = await this.etablissementsService.findOrCreate(
          updateUserDto.etablissement_etude,
        );
        updateUserDto.etablissement_etude = etab?.nom || null;
      } else {
        updateUserDto.etablissement_etude = null;
      }
    }

    // Transform date_naissance from YYYY-MM-DD to ISO-8601 DateTime
    if (updateUserDto.date_naissance) {
      const dateStr = updateUserDto.date_naissance;
      // If it's a simple date string (YYYY-MM-DD), convert to ISO DateTime at midnight
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        updateUserDto.date_naissance = new Date(dateStr + 'T00:00:00Z');
      }
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
      const dataToUpdate: any = {
        genre: updateProfileDto.genre,
      };

      // Transform date_naissance from YYYY-MM-DD to ISO-8601 DateTime
      if (updateProfileDto.date_naissance) {
        const dateStr = updateProfileDto.date_naissance;
        if (
          typeof dateStr === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ) {
          dataToUpdate.date_naissance = new Date(dateStr + 'T00:00:00Z');
        } else {
          dataToUpdate.date_naissance = new Date(
            updateProfileDto.date_naissance,
          );
        }
      }

      const user = await this.prisma.utilisateurs.update({
        where: { email: email.toLowerCase().trim() },
        data: dataToUpdate,
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

      // 🛡️ CAS DU RESPONSABLE_CENTRE : vue des membres de son propre centre uniquement
      if (requesterRole === 'RESPONSABLE_CENTRE' && requesterId) {
        const responsable = await this.prisma.utilisateurs.findUnique({
          where: { id: requesterId },
          select: { id_centre: true },
        });

        if (!responsable || !responsable.id_centre) return [];

        return await this.prisma.utilisateurs.findMany({
          where: { id_centre: responsable.id_centre },
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

  async findAllForMessaging(requesterId?: string) {
    try {
      return await this.prisma.utilisateurs.findMany({
        where: requesterId ? { id: { not: requesterId } } : undefined,
        select: {
          id: true,
          nom: true,
          prenom: true,
          photo_profil_url: true,
          role: true,
          is_online: true,
          last_seen_at: true,
        },
        orderBy: { nom: 'asc' },
      });
    } catch (error) {
      console.error('Erreur findAllForMessaging Users:', error);
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

  async findPublicProfile(targetUserId: string, viewerUserId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        role: true,
        bio: true,
        genre: true,
        date_naissance: true,
        photo_profil_url: true,
        lieu_habite: true,
        etablissement_etude: true,
        points: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
        _count: {
          select: {
            follower_users: true,
            following_users: true,
            posts: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const isMe = viewerUserId === targetUserId;
    const isFollowing = isMe
      ? false
      : (await this.prisma.user_follows.count({
          where: {
            follower_id: viewerUserId,
            followed_id: targetUserId,
          },
        })) > 0;

    return {
      ...user,
      _count: {
        followers: user._count.follower_users,
        following: user._count.following_users,
        posts: user._count.posts,
      },
      isMe,
      isFollowing,
    };
  }

  async followUser(followerId: string, followedId: string) {
    if (followerId === followedId) {
      throw new ConflictException('Vous ne pouvez pas vous suivre vous-meme');
    }

    const target = await this.prisma.utilisateurs.findUnique({
      where: { id: followedId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    await this.prisma.user_follows.upsert({
      where: {
        follower_id_followed_id: {
          follower_id: followerId,
          followed_id: followedId,
        },
      },
      update: {},
      create: {
        follower_id: followerId,
        followed_id: followedId,
      },
    });

    return { success: true };
  }

  async unfollowUser(followerId: string, followedId: string) {
    await this.prisma.user_follows.deleteMany({
      where: {
        follower_id: followerId,
        followed_id: followedId,
      },
    });

    return { success: true };
  }

  async findFollowingUsers(userId: string) {
    return this.prisma.user_follows.findMany({
      where: { follower_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        followed: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
            role: true,
          },
        },
      },
    });
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

  async assignResponsibleToCentre(userId: string, id_centre: string) {
    const [centre, roleObj] = await Promise.all([
      this.prisma.centres.findUnique({ where: { id: id_centre } }),
      this.prisma.roles.findUnique({ where: { nom: 'RESPONSABLE_CENTRE' } }),
    ]);

    if (!centre) {
      throw new NotFoundException('Centre introuvable');
    }

    return await this.prisma.utilisateurs.update({
      where: { id: userId },
      data: {
        id_centre,
        role: 'RESPONSABLE_CENTRE',
        id_role: roleObj?.id,
      },
      include: {
        centre: true,
      },
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

  async findAdherentsByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_centre,
        role: 'ADHERENT',
      },
      select: { id: true, nom: true, prenom: true, email: true, role: true },
      orderBy: { nom: 'asc' },
    });
  }

  async remove(id: string) {
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false },
    });
  }
}
