import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaMessage } from '../types';

export class KafkaService {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private readonly SCORE_TOPIC = 'score_submissions';
  private readonly LEADERBOARD_CHANGE_TOPIC = 'leaderboard_changes';
  private readonly LEADERBOARD_TOPIC = 'leaderboard_updates';

  constructor(brokers: string[], clientId: string) {
    this.kafka = new Kafka({
      clientId,
      brokers,
    });
  }

  /**
   * Initialize the producer
   */
  async initProducer(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    console.log('Kafka producer connected successfully');
  }

  /**
   * Initialize the consumer
   */
  async initConsumer(groupId: string): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId });
    await this.consumer.connect();
    console.log('Kafka consumer connected successfully');
  }

  /**
   * Publish a score submission to Kafka
   */
  async publishScoreSubmission(data: any): Promise<void> {
    if (!this.producer) {
      throw new Error('Producer not initialized');
    }

    const message: KafkaMessage = {
      type: 'SCORE_SUBMISSION',
      data,
      timestamp: Date.now(),
    };

    await this.producer.send({
      topic: this.SCORE_TOPIC,
      messages: [
        {
          key: data.player_id,
          value: JSON.stringify(message),
        },
      ],
    });
  }

  /**
   * Publish a leaderboard change event to Kafka
   */
  async publishLeaderboardChange(data: any): Promise<void> {
    if (!this.producer) {
      throw new Error('Producer not initialized');
    }

    const message: KafkaMessage = {
      type: 'LEADERBOARD_CHANGE',
      data,
      timestamp: Date.now(),
    };

    await this.producer.send({
      topic: this.LEADERBOARD_CHANGE_TOPIC,
      messages: [
        {
          value: JSON.stringify(message),
        },
      ],
    });
  }

  /**
   * Publish final leaderboard update to clients
   */
  async publishLeaderboardUpdate(leaderboardData: any): Promise<void> {
    if (!this.producer) {
      throw new Error('Producer not initialized');
    }

    await this.producer.send({
      topic: this.LEADERBOARD_TOPIC,
      messages: [
        {
          value: JSON.stringify(leaderboardData),
        },
      ],
    });
  }

  /**
   * Subscribe to score submissions topic and process messages
   */
  async subscribeToScoreSubmissions(
    handler: (message: any) => Promise<void>
  ): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    await this.consumer.subscribe({
      topic: this.SCORE_TOPIC,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (message.value) {
          const kafkaMessage: KafkaMessage = JSON.parse(
            message.value.toString()
          );
          await handler(kafkaMessage.data);
        }
      },
    });
  }

  /**
   * Subscribe to leaderboard changes topic and process messages
   */
  async subscribeToLeaderboardChanges(
    handler: (message: any) => Promise<void>
  ): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    await this.consumer.subscribe({
      topic: this.LEADERBOARD_CHANGE_TOPIC,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (message.value) {
          const kafkaMessage: KafkaMessage = JSON.parse(
            message.value.toString()
          );
          await handler(kafkaMessage);
        }
      },
    });
  }

  /**
   * Subscribe to leaderboard updates topic for WebSocket broadcasting
   */
  async subscribeToLeaderboardUpdates(
    handler: (message: any) => Promise<void>
  ): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    await this.consumer.subscribe({
      topic: this.LEADERBOARD_TOPIC,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (message.value) {
          const leaderboardData = JSON.parse(message.value.toString());
          await handler(leaderboardData);
        }
      },
    });
  }

  /**
   * Disconnect producer and consumer
   */
  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.consumer) {
      await this.consumer.disconnect();
    }
    console.log('Kafka disconnected successfully');
  }
}

