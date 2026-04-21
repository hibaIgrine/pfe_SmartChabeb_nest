import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { Server, Socket } from 'socket.io';

type JoinConversationPayload = {
  conversationId: string;
};

type TypingPayload = {
  conversationId: string;
  isTyping: boolean;
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MessagerieGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly jwtService = new JwtService();
  private readonly typingWindowMs = 8 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = String(client.data.userId ?? '');
    if (!userId) return;

    await this.prisma.conversation_participants.updateMany({
      where: {
        user_id: userId,
      },
      data: {
        last_typing_at: null,
      },
    });
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinConversationPayload,
  ) {
    const userId = String(client.data.userId ?? '');
    if (!userId || !body?.conversationId) return;

    const canJoin = await this.isParticipant(body.conversationId, userId);
    if (!canJoin) return;

    client.join(this.getConversationRoom(body.conversationId));

    const users = await this.getTypingUsers(body.conversationId, userId);
    client.emit('conversation:typing', {
      conversationId: body.conversationId,
      users,
      updatedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinConversationPayload,
  ) {
    if (!body?.conversationId) return;
    client.leave(this.getConversationRoom(body.conversationId));
  }

  @SubscribeMessage('conversation:typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: TypingPayload,
  ) {
    const userId = String(client.data.userId ?? '');
    if (!userId || !body?.conversationId) return;

    const canType = await this.isParticipant(body.conversationId, userId);
    if (!canType) return;

    await this.prisma.conversation_participants.update({
      where: {
        conversation_id_user_id: {
          conversation_id: body.conversationId,
          user_id: userId,
        },
      },
      data: {
        last_typing_at: body.isTyping ? new Date() : null,
      },
    });

    const users = await this.getTypingUsers(body.conversationId, userId);

    this.server
      .to(this.getConversationRoom(body.conversationId))
      .emit('conversation:typing', {
        conversationId: body.conversationId,
        users,
        updatedAt: new Date().toISOString(),
      });
  }

  private async isParticipant(conversationId: string, userId: string) {
    const membership = await this.prisma.conversation_participants.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private async getTypingUsers(conversationId: string, currentUserId: string) {
    const threshold = new Date(Date.now() - this.typingWindowMs);

    const participants = await this.prisma.conversation_participants.findMany({
      where: {
        conversation_id: conversationId,
        user_id: {
          not: currentUserId,
        },
        last_typing_at: {
          gte: threshold,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
            is_online: true,
            last_seen_at: true,
          },
        },
      },
      orderBy: {
        last_typing_at: 'desc',
      },
    });

    return participants.map((participant) => participant.user);
  }

  private getConversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header !== 'string') {
      return null;
    }

    const [prefix, token] = header.split(' ');
    if (prefix?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
