<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Address;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Bridge\Twig\Mime\TemplatedEmail;

class HomeController extends AbstractController
{
    private const INTERNAL_INBOX = 'acanettoyage.243@gmail.com';

    #[Route('/', name: 'app_home', methods: ['GET'])]
    public function index(): Response
    {
        return $this->render('home/index.html.twig');
    }

    #[Route('/contact', name: 'app_contact', methods: ['POST'])]
    public function contact(Request $request, MailerInterface $mailer): RedirectResponse
    {
        $prenom = trim((string) $request->request->get('prenom'));
        $nom = trim((string) $request->request->get('nom'));
        $email = trim((string) $request->request->get('email'));
        $ville = trim((string) $request->request->get('ville'));

        if ('' === $prenom || '' === $nom || '' === $email || '' === $ville) {
            $this->addFlash('error', 'Merci de renseigner vos nom, prénom, e-mail et ville.');

            return $this->redirect($this->generateUrl('app_home').'#contact');
        }

        if (false === filter_var($email, \FILTER_VALIDATE_EMAIL)) {
            $this->addFlash('error', 'Cette adresse e-mail ne semble pas valide. Vérifiez-la et renvoyez la demande.');

            return $this->redirect($this->generateUrl('app_home').'#contact');
        }

        $telephone = trim((string) $request->request->get('telephone'));
        $vars = [
            'prenom' => $prenom,
            'nom' => $nom,
            'entreprise' => trim((string) $request->request->get('entreprise')),
            // "email" est une variable réservée du contexte TemplatedEmail
            // (Symfony l'utilise pour représenter le message lui-même dans le
            // template) : on la transmet sous "contact_email" à la place.
            'contact_email' => $email,
            'telephone' => $telephone,
            'telephone_intl' => preg_replace('/^0/', '33', preg_replace('/[^0-9]/', '', $telephone)),
            'ville' => $ville,
            'type_nettoyage' => trim((string) $request->request->get('type_nettoyage')),
            'frequence' => trim((string) $request->request->get('frequence')),
            // Formulaire court : ces champs viennent de la maquette complète
            // (ui_kits/website/ContactScreen.jsx) et restent vides ici.
            'precision' => '',
            'quantite' => '',
            'agence' => '',
            'prestations' => '',
            'canal' => trim((string) $request->request->get('canal')) ?: 'e-mail',
            'message' => trim((string) $request->request->get('message')),
            'date_envoi' => (new \DateTimeImmutable())->format('d/m/Y H:i'),
            'echeance_24h' => (new \DateTimeImmutable('+24 hours'))->format('d/m H:i'),
        ];

        // TODO: MAILER_DSN vaut null://null par défaut (aucun envoi réel) tant que
        // les identifiants SMTP du client ne sont pas disponibles. Remplacer par un
        // DSN réel (Brevo, Mailjet…) dans .env.local pour activer l'envoi.
        $mailer->send((new TemplatedEmail())
            ->from(new Address(self::INTERNAL_INBOX, 'ACA Nettoyage'))
            ->to($email)
            ->subject('Nous avons bien reçu votre demande — ACA Nettoyage')
            ->htmlTemplate('email/confirmation_client.html.twig')
            ->context($vars));

        $mailer->send((new TemplatedEmail())
            ->from(new Address(self::INTERNAL_INBOX, 'ACA Nettoyage — Site web'))
            ->to(self::INTERNAL_INBOX)
            ->subject(sprintf('Nouvelle demande — %s — %s', $vars['type_nettoyage'], $vars['ville']))
            ->htmlTemplate('email/notification_interne.html.twig')
            ->context($vars));

        $this->addFlash('success', 'Votre demande a bien été enregistrée. Nous revenons vers vous sous 24 h ouvrées.');

        return $this->redirect($this->generateUrl('app_home').'#contact');
    }
}
