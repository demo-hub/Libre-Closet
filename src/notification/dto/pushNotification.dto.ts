export class PushNotificationDto {
  title: string;
  body: string;
  /** Where a click on the notification goes, on this origin. */
  url?: string;
}
